import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { eurosToCents } from "@/lib/server/ticketing";
import { getMollie } from "@/lib/server/mollie";
import { validateCheckoutInput, type CheckoutInput } from "@/lib/server/checkoutValidation";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const sql = getDb();
  try {
    const parsed = validateCheckoutInput(await parseBody<Partial<CheckoutInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);
    const { eventUuid, dateUuid, ticketIds, name, email } = parsed.value;

    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    if (event.tickets_open !== true) return errorResponse("Date not on sale", 404);
    const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
    if (!date || typeof date.price !== "number") return errorResponse("Date not on sale", 404);

    const totalCents = eurosToCents(date.price) * ticketIds.length;
    const totalEuros = (totalCents / 100).toFixed(2);

    // The order row is created first so its id can be written into the tickets
    // by the same statement that claims them.
    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${totalCents}, 'pending')
      RETURNING id;
    `;
    const orderId = created[0].id as string;

    const releaseAndDelete = async () => {
      await sql`
        UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
        WHERE order_id = ${orderId};
      `;
      await sql`DELETE FROM orders WHERE id = ${orderId};`;
    };

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

    return jsonResponse({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    // Never echo driver or provider internals back to the browser.
    console.error("Checkout error:", err);
    return errorResponse("Checkout failed. Please try again.", 500);
  }
}
