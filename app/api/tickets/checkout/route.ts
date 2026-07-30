import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { eurosToCents, isDateOpen } from "@/lib/server/ticketing";
import { getMollie } from "@/lib/server/mollie";
import { validateCheckoutInput, type CheckoutInput } from "@/lib/server/checkoutValidation";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const sql = getDb();
  let orderId: string | null = null;

  // Best-effort compensation. Guarded on orderId being set (nothing to
  // release before the order INSERT commits) and called from both the known
  // failure paths below and the outer catch, so a mid-flight failure after
  // the order exists — including one where the claim statement itself throws
  // after having already committed server-side — never leaves an orphaned
  // pending order or a hold nothing will ever release before its 10-minute
  // expiry.
  const releaseAndDelete = async () => {
    await sql`
      UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
      WHERE order_id = ${orderId};
    `;
    await sql`DELETE FROM orders WHERE id = ${orderId};`;
  };

  // Every ticket this order will produce has to be signed with
  // TICKET_QR_SECRET at email time. Without it the payment is captured, the
  // tickets are marked sold, and signing then throws where nothing can retry
  // it — a charged customer with no ticket and no recovery path. Refuse
  // before any money or database state moves.
  if (!process.env.TICKET_QR_SECRET) {
    console.error("Checkout rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Ticket sales are temporarily unavailable.", 503);
  }

  try {
    const parsed = validateCheckoutInput(await parseBody<Partial<CheckoutInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);
    const { eventUuid, dateUuid, ticketIds, name, email } = parsed.value;

    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
    if (!date || !isDateOpen(event, date)) return errorResponse("Date not on sale", 404);

    const totalCents = eurosToCents(date.price) * ticketIds.length;
    const totalEuros = (totalCents / 100).toFixed(2);

    // The order row is created first so its id can be written into the tickets
    // by the same statement that claims them.
    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status, payment_started_at)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${totalCents}, 'pending', now())
      RETURNING id;
    `;
    orderId = created[0].id as string;

    // Single-statement claim. Neon's HTTP driver has no interactive
    // transactions, so every precondition lives in the WHERE clause and the
    // row count in RETURNING tells us whether we won the race. Times are
    // compared against the database clock, never the Node clock.
    const claimed = await sql`
      UPDATE tickets t
         SET status = 'held',
             held_until = now() + interval '10 minutes',
             order_id = ${orderId}
        FROM seats s
       WHERE s.id = t.seat_id
         AND t.id = ANY(${ticketIds})
         AND t.event_uuid = ${eventUuid}
         AND t.date_uuid = ${dateUuid}
         AND s.reserved_for IS NULL
         AND (t.status = 'available'
              OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now()))
         -- A lapsed 10-minute hold is normally free to reclaim, but not while
         -- its order still has a live Mollie session: that customer may be
         -- mid-payment, and taking the seat would leave them charged with no
         -- ticket. The one-hour bound is DELIBERATE AND REQUIRED — do not
         -- "simplify" it away. A real Mollie session expires well inside an
         -- hour, so it is always protected; but an abandoned order whose
         -- expired/canceled webhook never arrives would otherwise lock its
         -- seats forever, which is worse than the bug this closes.
         AND (t.order_id IS NULL OR NOT EXISTS (
               SELECT 1 FROM orders o
               WHERE o.id = t.order_id
                 AND o.status = 'pending'
                 AND o.mollie_payment_id IS NOT NULL
                 AND coalesce(o.payment_started_at, o.created_at) > now() - interval '1 hour'))
      RETURNING t.id;
    `;

    if (claimed.length !== ticketIds.length) {
      await releaseAndDelete();
      return errorResponse("One or more seats are no longer available.", 409);
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const isLocal = baseUrl.includes("localhost");

    let payment;
    try {
      payment = await getMollie().payments.create({
        amount: { currency: "EUR", value: totalEuros },
        description: `${ticketIds.length} ticket${ticketIds.length > 1 ? "s" : ""} – ${event.title}`,
        redirectUrl: `${baseUrl}/event/${eventUuid}/ticket/${dateUuid}/confirm?order=${orderId}`,
        ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/tickets/webhook/mollie` }),
        metadata: { orderId },
      });
    } catch (mollieErr) {
      await releaseAndDelete();
      throw mollieErr;
    }

    await sql`UPDATE orders SET mollie_payment_id = ${payment.id} WHERE id = ${orderId};`;

    return jsonResponse({ checkoutUrl: payment.getCheckoutUrl(), orderId });
  } catch (err) {
    // Never echo driver or provider internals back to the browser.
    console.error("Checkout error:", err);
    if (orderId) {
      // Best-effort: a failure here must never replace the original error or
      // change the response. If the claim never committed this updates 0
      // tickets and deletes the order just inserted; if it did commit, this
      // is exactly the compensation that path needed.
      try {
        await releaseAndDelete();
      } catch (releaseErr) {
        console.error("Checkout compensation failed:", releaseErr);
      }
    }
    return errorResponse("Checkout failed. Please try again.", 500);
  }
}
