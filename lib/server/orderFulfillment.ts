import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getMollie } from "./mollie";
import type { Event, Order } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export type FulfillResult = "paid" | "released" | "ignored";

/** Mollie reports amounts as decimal strings; orders store integer cents. */
export function paymentAmountMatchesOrder(paymentValue: string, orderTotalCents: number): boolean {
  const parsed = Number.parseFloat(paymentValue);
  if (!Number.isFinite(parsed)) return false;
  return Math.round(parsed * 100) === orderTotalCents;
}

/**
 * Apply the current Mollie state of `paymentId` to its order.
 *
 * Safe to call any number of times for the same payment. On the paid path,
 * tickets are sold before the order is claimed: selling is naturally
 * idempotent (a retry matches zero already-sold rows), so the order stays
 * 'pending' — and thus retryable as a whole — until every mutation before
 * the claim has succeeded. Only the conditional claim itself, `WHERE status
 * <> 'paid'`, is the exactly-once gate; it guards the email, not the sale.
 * Called by the Mollie webhook and, as a self-healing fallback, by the
 * order-status poll.
 */
export async function applyMolliePaymentToOrder(sql: Sql, paymentId: string): Promise<FulfillResult> {
  const payment = await getMollie().payments.get(paymentId);

  const orderId = (payment.metadata as { orderId?: string } | null)?.orderId;
  if (!orderId) {
    console.error(`Mollie payment ${paymentId} carries no orderId metadata`);
    return "ignored";
  }

  const orderRows = await sql`SELECT * FROM orders WHERE id = ${orderId};`;
  const order = orderRows[0] as Order | undefined;
  if (!order) {
    console.error(`Mollie payment ${paymentId} references unknown order ${orderId}`);
    return "ignored";
  }

  // The order records which payment is allowed to settle it.
  if (order.mollie_payment_id && order.mollie_payment_id !== payment.id) {
    console.error(
      `Payment/order mismatch: order ${orderId} expects ${order.mollie_payment_id}, got ${payment.id}`,
    );
    return "ignored";
  }

  if (payment.status === "paid") {
    if (!paymentAmountMatchesOrder(payment.amount.value, order.total_amount)) {
      console.error(
        `Amount mismatch on order ${orderId}: paid ${payment.amount.value}, expected ${order.total_amount} cents`,
      );
      return "ignored";
    }

    // Sell first, claim second. Selling is a harmless 0-row no-op on a retry
    // that already sold these tickets, and if anything below throws, the
    // order is still 'pending' — a retry re-enters this whole function and
    // re-runs this UPDATE (still a no-op the second time) rather than being
    // short-circuited by an order that's already 'paid' with tickets stuck
    // 'held' forever.
    await sql`
      UPDATE tickets SET status = 'sold', held_until = NULL
      WHERE order_id = ${orderId} AND status = 'held';
    `;

    // Re-read rather than trust the UPDATE's own RETURNING, so a retry that
    // finds 0 rows above (because an earlier call already sold them) still
    // sees the authoritative sold set here.
    const soldTickets = await sql`
      SELECT t.id, s."row" AS row, s.seat_number AS seat_number
      FROM tickets t JOIN seats s ON s.id = t.seat_id
      WHERE t.order_id = ${orderId} AND t.status = 'sold';
    `;

    // Idempotency claim: zero rows means another call already fulfilled
    // this order (marked it paid and, if it got this far, sent the email).
    const claimed = await sql`
      UPDATE orders SET status = 'paid'
      WHERE id = ${orderId} AND status <> 'paid'
      RETURNING *;
    `;
    if (claimed.length === 0) return "ignored";
    const paidOrder = claimed[0] as Order;

    if (soldTickets.length === 0) {
      // The order was paid but held no seats — they were taken by a later
      // order, or already released. Sending a ticketless confirmation would
      // make it worse; this needs a human (refund or reseat).
      console.error(
        `Order ${orderId} was paid but claimed no held tickets — seats lost, manual intervention required.`,
      );
      return "paid";
    }

    const events = await sql`SELECT * FROM events WHERE uuid = ${paidOrder.event_uuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((d) => d.uuid === paidOrder.date_uuid);

    try {
      const { sendTicketEmail } = await import("@/lib/sendTicketEmail");
      await sendTicketEmail({
        order: paidOrder,
        eventName: event?.title ?? "Show",
        startTime: date?.start_time ?? null,
        location: event?.eventlocation?.location || event?.eventlocation?.city || null,
        productionTheme: event?.production_theme ?? null,
        seats: soldTickets.map((t) => ({
          ticketId: t.id,
          row: t.row,
          seat_number: t.seat_number,
        })),
      });
    } catch (emailErr) {
      console.error(`Email send failed for order ${orderId}:`, emailErr);
    }

    return "paid";
  }

  if (["expired", "canceled", "failed"].includes(payment.status)) {
    await sql`
      UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
      WHERE order_id = ${orderId} AND status = 'held';
    `;
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${orderId} AND status = 'pending';`;
    return "released";
  }

  return "ignored";
}

/**
 * Third reconciliation path, alongside the webhook and the order-status poll:
 * neither of those fires if the webhook is dropped/delayed AND the customer's
 * browser never lands back on (or stays on) the confirm page. Meant to be
 * driven by a scheduled sweep (cron) or an admin action, not by request traffic.
 *
 * The age floor excludes orders still plausibly mid-payment on Mollie's
 * hosted page, so a sweep doesn't burn a Mollie API call per in-flight
 * checkout every time it runs.
 */
export async function reconcileStuckOrders(
  sql: Sql,
  minAgeMinutes = 5,
): Promise<{ checked: number; results: FulfillResult[] }> {
  const stuck = await sql`
    SELECT id, mollie_payment_id FROM orders
    WHERE status = 'pending'
      AND mollie_payment_id IS NOT NULL
      AND created_at < now() - make_interval(mins => ${minAgeMinutes});
  `;

  const results: FulfillResult[] = [];
  for (const row of stuck as { id: string; mollie_payment_id: string }[]) {
    try {
      results.push(await applyMolliePaymentToOrder(sql, row.mollie_payment_id));
    } catch (err) {
      console.error(`Reconcile sweep failed for order ${row.id}:`, err);
    }
  }
  return { checked: stuck.length, results };
}
