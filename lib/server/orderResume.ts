import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getMollie } from "./mollie";

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
