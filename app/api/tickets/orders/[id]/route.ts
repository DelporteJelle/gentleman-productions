import { getDb, jsonResponse, errorResponse, getPathId } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { applyMolliePaymentToOrder } from "@/lib/server/orderFulfillment";

export async function GET(request: Request) {
  const id = getPathId(request);
  if (!id) return errorResponse("ID is required", 400);
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const sql = getDb();
  try {
    // has_tickets lets the confirm page tell "paid, seats assigned" apart from
    // "paid but we lost the seats" — the second case must never be shown as
    // "You're in!".
    const rows = await sql`
      SELECT id, status, mollie_payment_id,
             EXISTS(SELECT 1 FROM tickets WHERE order_id = ${id} AND status = 'sold') AS has_tickets
      FROM orders WHERE id = ${id};
    `;
    if (rows.length === 0) return errorResponse("Order not found", 404);
    const order = rows[0] as {
      id: string;
      status: string;
      mollie_payment_id: string | null;
      has_tickets: boolean;
    };

    // The webhook is the primary path, but it can be dropped or delayed. The
    // confirm page polls this endpoint, so use it to reconcile: fulfilment is
    // idempotent, so a late webhook afterwards is harmless.
    if (order.status === "pending" && order.mollie_payment_id) {
      try {
        await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
        const refreshed = await sql`
          SELECT status,
                 EXISTS(SELECT 1 FROM tickets WHERE order_id = ${id} AND status = 'sold') AS has_tickets
          FROM orders WHERE id = ${id};
        `;
        return jsonResponse({
          status: (refreshed[0]?.status as string) ?? order.status,
          has_tickets: (refreshed[0]?.has_tickets as boolean) ?? order.has_tickets,
        });
      } catch (reconcileErr) {
        console.error(`Reconciliation failed for order ${id}:`, reconcileErr);
      }
    }

    return jsonResponse({ status: order.status, has_tickets: order.has_tickets });
  } catch (err) {
    console.error("Failed to load order:", err);
    return errorResponse("Failed to load order", 500);
  }
}
