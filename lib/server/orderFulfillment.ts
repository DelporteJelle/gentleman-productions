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
 * Safe to call any number of times for the same payment: the transition to
 * `paid` is claimed with a conditional UPDATE, so only the first caller ever
 * marks tickets sold or sends the email. Called by the Mollie webhook and, as
 * a self-healing fallback, by the order-status poll.
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

    // Idempotency claim: zero rows means another call already fulfilled this.
    const claimed = await sql`
      UPDATE orders SET status = 'paid'
      WHERE id = ${orderId} AND status <> 'paid'
      RETURNING *;
    `;
    if (claimed.length === 0) return "ignored";
    const paidOrder = claimed[0] as Order;

    const soldTickets = await sql`
      UPDATE tickets SET status = 'sold', held_until = NULL
      WHERE order_id = ${orderId} AND status = 'held'
      RETURNING id, (SELECT "row" FROM seats WHERE seats.id = tickets.seat_id) AS row,
                    (SELECT seat_number FROM seats WHERE seats.id = tickets.seat_id) AS seat_number;
    `;

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
        productionTheme: event?.production_theme ?? null,
        seats: soldTickets.map((t) => ({ id: t.id, row: t.row, seat_number: t.seat_number })),
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
