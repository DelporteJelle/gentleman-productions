import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { eurosToCents } from "@/lib/server/ticketing";
import { isDateOpen } from "@/lib/dateAvailability";
import { getMollie } from "@/lib/server/mollie";
import { validateCheckoutInput, type CheckoutInput } from "@/lib/server/checkoutValidation";
import { claimCodes, releaseCodesForOrder } from "@/lib/server/ticketCodes";
import { computeOrderTotalCents } from "@/lib/ticketCodes";
import { fulfilPaidOrder } from "@/lib/server/orderFulfillment";
import type { Event } from "@/types";

/** Compares as false rather than SQL NULL when no wheelchair place is unlocked. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const sql = getDb();
  let orderId: string | null = null;
  // Set immediately before the fulfilPaidOrder call, before anything inside it
  // is known to have succeeded or failed. Once true, releaseAndDelete must
  // never run: fulfilment may already have sold the tickets and/or marked the
  // order paid, and compensation is only safe for an order that is still
  // wholly ours to undo.
  let fulfilmentStarted = false;

  // Best-effort compensation. Guarded on orderId being set (nothing to
  // release before the order INSERT commits) and called from both the known
  // failure paths below and the outer catch, so a mid-flight failure after
  // the order exists — including one where the claim statement itself throws
  // after having already committed server-side — never leaves an orphaned
  // pending order or a hold nothing will ever release before its 10-minute
  // expiry.
  const releaseAndDelete = async () => {
    // Seats are released FIRST, before codes: seats are the scarcer resource,
    // so if releasing codes throws, the seats must already be free rather
    // than stranded behind it.
    // `AND status = 'held'` bounds the blast radius: a ticket already sold
    // (by a fulfilment this same request triggered, or by anything else)
    // must never be un-sold. Mirrors expirePendingOrder in orderResume.ts.
    await sql`
      UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
      WHERE order_id = ${orderId} AND status = 'held';
    `;
    await releaseCodesForOrder(sql, orderId!);
    // `AND status <> 'paid'` for the same reason: a paid order must never be
    // deleted out from under its own tickets.
    await sql`DELETE FROM orders WHERE id = ${orderId} AND status <> 'paid';`;
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
    const { eventUuid, dateUuid, ticketIds, name, email, codes } = parsed.value;

    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
    if (!date || !isDateOpen(event, date)) return errorResponse("Date not on sale", 404);

    const priceCents = eurosToCents(date.price);
    const grossCents = priceCents * ticketIds.length;

    // The order row is created first so its id can be written into the tickets
    // by the same statement that claims them.
    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status, payment_started_at)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${grossCents}, 'pending', now())
      RETURNING id;
    `;
    orderId = created[0].id as string;

    // Codes are claimed BEFORE the seats, because whether a wheelchair place
    // may be claimed at all depends on a wheelchair code having been won here.
    const claimedCodes = await claimCodes(sql, orderId, eventUuid, codes);
    if (claimedCodes.length !== codes.length) {
      await releaseAndDelete();
      return errorResponse("Eén of meer codes zijn niet (meer) geldig.", 409);
    }

    const wheelchairCodes = claimedCodes.filter((c) => c.kind === "wheelchair").length;
    const freeCodes = claimedCodes.filter((c) => c.kind === "free_ticket").length;

    if (wheelchairCodes > 1) {
      await releaseAndDelete();
      return errorResponse("Je kan maar één rolstoelcode per bestelling gebruiken.", 409);
    }
    if (freeCodes > ticketIds.length) {
      await releaseAndDelete();
      return errorResponse("Je hebt meer gratis-codes dan tickets.", 409);
    }

    // What the requested tickets actually ARE, read from the database — never
    // taken on the client's word.
    const requested = await sql`
      SELECT id, seat_kind FROM tickets
       WHERE id = ANY(${ticketIds}) AND event_uuid = ${eventUuid} AND date_uuid = ${dateUuid};
    `;
    const anchors = requested.filter((r) => r.seat_kind === "wheelchair");
    const floors = requested.filter((r) => r.seat_kind === "wheelchair_floor");

    if (floors.length > 0 || anchors.length > 1) {
      await releaseAndDelete();
      return errorResponse("Ongeldige stoelselectie.", 409);
    }
    if (anchors.length === 1 && wheelchairCodes === 0) {
      await releaseAndDelete();
      return errorResponse("Voor een rolstoelplaats heb je een code nodig.", 409);
    }
    if (anchors.length === 0 && wheelchairCodes === 1) {
      // Refuse rather than silently burn a single-use code on nothing.
      await releaseAndDelete();
      return errorResponse("Je hebt een rolstoelcode ingegeven maar geen rolstoelplaats gekozen.", 409);
    }

    const wheelchairTicketId = (anchors[0]?.id as string | undefined) ?? NIL_UUID;

    // Single-statement claim. Neon's HTTP driver has no interactive
    // transactions, so every precondition lives in the WHERE clause and the
    // row count in RETURNING tells us whether we won the race. Times are
    // compared against the database clock, never the Node clock.
    const claimed = await sql`
      UPDATE tickets t
         SET status = 'held',
             held_until = now() + interval '10 minutes',
             order_id = ${orderId}
       WHERE t.id = ANY(${ticketIds})
         AND t.event_uuid = ${eventUuid}
         AND t.date_uuid = ${dateUuid}
         -- Widened by exactly one term: the single anchor a wheelchair code
         -- unlocked, or the nil uuid (matching nothing) when none did.
         AND (t.seat_kind IS NULL OR t.id = ${wheelchairTicketId})
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

    const totalCents = computeOrderTotalCents({
      seatCount: ticketIds.length,
      priceCents,
      freeCodeCount: freeCodes,
    });
    if (totalCents !== grossCents) {
      await sql`UPDATE orders SET total_amount = ${totalCents} WHERE id = ${orderId};`;
    }

    // Nothing left to pay: no Mollie session exists to settle this order, so
    // fulfil it here through the same function the paid path uses.
    if (totalCents === 0) {
      fulfilmentStarted = true;
      await fulfilPaidOrder(sql, orderId);
      return jsonResponse({ orderId, free: true });
    }

    const totalEuros = (totalCents / 100).toFixed(2);

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
    if (fulfilmentStarted) {
      // fulfilPaidOrder may have already sold the tickets and/or marked the
      // order paid before this throw — compensating now would risk un-selling
      // a sold ticket or deleting a paid order. Leave it exactly as it is and
      // shout: this order needs a human, not an automatic rollback.
      console.error(
        `Checkout order ${orderId} failed during €0 fulfilment and was NOT rolled back — ` +
          `its tickets may already be marked 'sold' and/or the order may already be 'paid', and ` +
          `any ticket_codes it claimed may need manual release. ` +
          `Manual intervention required: check order ${orderId} (orders.status, tickets.order_id, ` +
          `ticket_codes.used_by_order_id) and complete or refund it by hand.`,
        err,
      );
    } else if (orderId) {
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
