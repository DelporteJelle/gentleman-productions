import type { NeonQueryFunction } from "@neondatabase/serverless";
import { applyMolliePaymentToOrder } from "./orderFulfillment";
import { expirePendingOrder } from "./orderResume";
import { getMollie } from "./mollie";
import type { OrderView } from "@/types";

type Sql = NeonQueryFunction<false, false>;

interface OrderRow {
  id: string;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  window_live: boolean;
  expires_at: string;
  event_uuid: string;
  date_uuid: string;
  total_amount: number;
  has_tickets: boolean;
}

async function readOrderRow(sql: Sql, orderId: string): Promise<OrderRow | undefined> {
  const rows = await sql`
    SELECT o.id, o.status, o.mollie_payment_id, o.event_uuid, o.date_uuid, o.total_amount,
           coalesce(o.payment_started_at, o.created_at) > now() - interval '1 hour' AS window_live,
           coalesce(o.payment_started_at, o.created_at) + interval '1 hour' AS expires_at,
           EXISTS(SELECT 1 FROM tickets WHERE order_id = o.id AND status = 'sold') AS has_tickets
    FROM orders o WHERE o.id = ${orderId};
  `;
  return rows[0] as OrderRow | undefined;
}

/**
 * Everything the browser needs to render one saved order.
 *
 * Reconciles as a side effect, on purpose. The webhook is the primary
 * fulfilment path but can be dropped or delayed, and this endpoint is polled
 * by both the confirm page and the saved-order banner — which makes it the
 * most reliable moment we get to re-check Mollie. It also retires an order
 * whose protection window has lapsed, returning its seats to the pool
 * immediately instead of leaving them attached to a dead order until the
 * nightly reconcile sweep.
 */
export async function loadOrderView(sql: Sql, orderId: string): Promise<OrderView | null> {
  let order = await readOrderRow(sql, orderId);
  if (!order) return null;

  if (order.status === "pending" && order.mollie_payment_id) {
    try {
      await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
      order = (await readOrderRow(sql, orderId)) ?? order;
    } catch (err) {
      console.error(`Reconciliation failed for order ${orderId}:`, err);
    }

    // Still pending past its window: fulfilment left it alone, which means
    // Mollie reported something other than paid/dead. Only an `open` payment
    // may be retired here — 'pending'/'authorized' mean money is in flight,
    // and expiring those would release seats a customer is about to own.
    if (order.status === "pending" && !order.window_live && order.mollie_payment_id) {
      try {
        const payment = await getMollie().payments.get(order.mollie_payment_id);
        if (payment.status === "open") {
          await expirePendingOrder(sql, order, payment);
          order = (await readOrderRow(sql, orderId)) ?? order;
        }
      } catch (err) {
        // Unreachable Mollie means we cannot prove the order is unpaid, so we
        // must not expire it. It stays pending and non-resumable.
        console.error(`Window check failed for order ${orderId}:`, err);
      }
    }
  }

  const seatRows = await sql`
    SELECT s."row" AS row, s.seat_number AS seat_number
    FROM tickets t JOIN seats s ON s.id = t.seat_id
    WHERE t.order_id = ${orderId}
    ORDER BY s."row", s.seat_number;
  `;
  const eventRows = await sql`SELECT title, dates FROM events WHERE uuid = ${order.event_uuid};`;
  const event = eventRows[0] as
    | { title: string; dates: { uuid: string; start_time: string }[] | null }
    | undefined;

  const base = {
    orderId: order.id,
    eventUuid: order.event_uuid,
    dateUuid: order.date_uuid,
    eventTitle: event?.title ?? "Voorstelling",
    startTime:
      (event?.dates ?? []).find((d) => d.uuid === order.date_uuid)?.start_time ?? null,
    seatLabels: seatRows.map((r) => `${r.row}${r.seat_number}`),
    totalAmount: order.total_amount,
  };

  if (order.status === "paid") return { ...base, state: "paid", hasTickets: order.has_tickets };
  if (order.status === "cancelled") return { ...base, state: "cancelled" };
  return {
    ...base,
    state: "pending",
    resumable: order.window_live,
    // Passed through as-is: the driver already returns timestamptz columns as
    // ISO strings (see `held_until`, `created_at` elsewhere), and reformatting
    // through `new Date().toISOString()` here only risks disagreeing with it
    // (e.g. forcing milliseconds where the source string had none).
    expiresAt: order.expires_at,
  };
}
