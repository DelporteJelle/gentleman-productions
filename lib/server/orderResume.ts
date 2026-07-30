import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getMollie } from "./mollie";
import { applyMolliePaymentToOrder } from "./orderFulfillment";
import { isDateOpen } from "./ticketing";
import type { Event } from "@/types";

type Sql = NeonQueryFunction<false, false>;

/** The only two payment fields the expiry path needs, so tests need no full Payment. */
export type CancelablePayment = { status: string; isCancelable: boolean };

/**
 * Retire a pending order whose seat-protection window has lapsed: release its
 * seats and mark it cancelled.
 *
 * Mollie is cancelled FIRST, deliberately. Once the window has lapsed the
 * seats are claimable by rivals whether or not we release them, so releasing
 * is not what creates the risk — but leaving a live payment session behind
 * lets a stale Mollie tab charge someone for seats they no longer hold.
 * Killing the session first shrinks that window to nothing.
 *
 * If the payment is not cancelable (some methods, e.g. bank transfer) and
 * later settles anyway, `applyMolliePaymentToOrder` handles it: it finds no
 * held tickets, logs "paid but claimed no held tickets — manual intervention
 * required", and the customer is shown the existing "er is iets misgelopen"
 * copy rather than a false success.
 */
export async function expirePendingOrder(
  sql: Sql,
  order: { id: string; mollie_payment_id: string | null },
  payment: CancelablePayment | null,
): Promise<void> {
  if (order.mollie_payment_id && payment?.isCancelable) {
    try {
      await getMollie().payments.cancel(order.mollie_payment_id);
    } catch (err) {
      // Best-effort. A Mollie outage must not strand the seats on a dead order.
      console.error(`Could not cancel Mollie payment ${order.mollie_payment_id}:`, err);
    }
  }

  // `AND status = 'held'` bounds the blast radius: a sold ticket carrying this
  // order_id (paid between our read and now) must never be un-sold.
  await sql`
    UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
    WHERE order_id = ${order.id} AND status = 'held';
  `;
  await sql`
    UPDATE orders SET status = 'cancelled'
    WHERE id = ${order.id} AND status = 'pending';
  `;
}

export type ResumeResult =
  | { state: "checkout"; checkoutUrl: string }
  | { state: "paid" }
  | { state: "cancelled" }
  | { state: "unknown" }
  | { state: "not_found" };

/** Mollie is still working on it — no checkout page to send anyone to, and
 *  minting a second payment could double-charge. */
const IN_FLIGHT = ["pending", "authorized"];
/** No longer payable; a replacement payment is safe. */
const DEAD = ["expired", "canceled", "failed"];

/**
 * Continue an abandoned checkout.
 *
 * Mollie is consulted BEFORE the window is judged, always. An order whose
 * payment silently succeeded looks exactly like an abandoned one from the
 * database's side, and telling that customer their reservation expired would
 * invite a second payment for tickets they already own.
 */
export async function resumeOrder(sql: Sql, orderId: string): Promise<ResumeResult> {
  const rows = await sql`
    SELECT id, event_uuid, date_uuid, total_amount, status, mollie_payment_id,
           coalesce(payment_started_at, created_at) > now() - interval '1 hour' AS window_live
    FROM orders WHERE id = ${orderId};
  `;
  const order = rows[0] as
    | {
        id: string;
        event_uuid: string;
        date_uuid: string;
        total_amount: number;
        status: "pending" | "paid" | "cancelled";
        mollie_payment_id: string | null;
        window_live: boolean;
      }
    | undefined;

  if (!order) return { state: "not_found" };
  if (order.status === "paid") return { state: "paid" };
  if (order.status === "cancelled") return { state: "cancelled" };

  // A pending order with no payment never got past checkout's Mollie call and
  // its compensation should already have removed it. Nothing to resume.
  if (!order.mollie_payment_id) return { state: "unknown" };

  let payment;
  try {
    payment = await getMollie().payments.get(order.mollie_payment_id);
  } catch (err) {
    console.error(`Resume could not reach Mollie for order ${orderId}:`, err);
    return { state: "unknown" };
  }

  if (payment.status === "paid") {
    await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
    return { state: "paid" };
  }

  if (IN_FLIGHT.includes(payment.status)) return { state: "unknown" };

  if (!order.window_live) {
    await expirePendingOrder(sql, order, payment);
    return { state: "cancelled" };
  }

  // Inside the window the seats are provably still this order's: the checkout
  // claim guard cannot hand even one of them to a rival. So there is no
  // seat-count reconciliation to do here — only a clock to push forward.
  await sql`
    UPDATE orders SET payment_started_at = now()
    WHERE id = ${orderId} AND status = 'pending';
  `;
  await sql`
    UPDATE tickets SET held_until = now() + interval '10 minutes'
    WHERE order_id = ${orderId} AND status = 'held';
  `;

  if (payment.status === "open") {
    return { state: "checkout", checkoutUrl: payment.getCheckoutUrl()! };
  }

  if (!DEAD.includes(payment.status)) {
    console.error(`Resume saw unexpected Mollie status "${payment.status}" on order ${orderId}`);
    return { state: "unknown" };
  }

  const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = (event?.dates ?? []).find((d) => d.uuid === order.date_uuid);
  if (!event || !date || !isDateOpen(event, date)) return { state: "unknown" };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const isLocal = baseUrl.includes("localhost");

  // The stored total, never a recomputed one: the customer agreed to this
  // amount, and a price edit since then must not silently change it.
  const fresh = await getMollie().payments.create({
    amount: { currency: "EUR", value: (order.total_amount / 100).toFixed(2) },
    description: `Tickets – ${event.title}`,
    redirectUrl: `${baseUrl}/event/${order.event_uuid}/ticket/${order.date_uuid}/confirm?order=${orderId}`,
    ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/tickets/webhook/mollie` }),
    metadata: { orderId },
  });

  // Compare-and-swap. `resumeOrder` can run twice for the same order at once
  // (a double-click, two tabs); both racers read the same dead payment and
  // both call Mollie for real, so `fresh` may not be the only new payment in
  // flight. `AND status = 'pending'` alone does NOT close this race — both
  // racers see 'pending' at read time. It is the `mollie_payment_id =
  // ${order.mollie_payment_id}` comparison that does the work: whichever
  // caller's UPDATE lands first changes that column out from under the
  // other, so only one of the two matching WHERE clauses can still be true.
  // Do not "simplify" this back down to the status check alone.
  const swapped = await sql`
    UPDATE orders SET mollie_payment_id = ${fresh.id}
    WHERE id = ${orderId}
      AND status = 'pending'
      AND mollie_payment_id = ${order.mollie_payment_id}
    RETURNING id;
  `;

  if (swapped.length > 0) {
    return { state: "checkout", checkoutUrl: fresh.getCheckoutUrl()! };
  }

  // Lost the race: some other caller's swap already replaced the payment we
  // read. `fresh` is an orphaned Mollie session tied to nothing — handing its
  // URL to this caller would send them to a checkout no one else is waiting
  // on. Re-read what actually won and defer to it instead.
  const currentRows = await sql`
    SELECT id, event_uuid, date_uuid, total_amount, status, mollie_payment_id,
           coalesce(payment_started_at, created_at) > now() - interval '1 hour' AS window_live
    FROM orders WHERE id = ${orderId};
  `;
  const current = currentRows[0] as typeof order | undefined;
  if (!current) return { state: "unknown" };
  if (current.status === "paid") return { state: "paid" };

  if (current.status === "pending" && current.mollie_payment_id && current.mollie_payment_id !== order.mollie_payment_id) {
    try {
      const winner = await getMollie().payments.get(current.mollie_payment_id);
      if (winner.status === "open") {
        return { state: "checkout", checkoutUrl: winner.getCheckoutUrl()! };
      }
    } catch (err) {
      console.error(`Resume could not reach Mollie for the winning payment on order ${orderId}:`, err);
    }
  }

  return { state: "unknown" };
}
