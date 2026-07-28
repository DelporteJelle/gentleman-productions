import { getDb, jsonResponse, errorResponse, getPathId } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { applyMolliePaymentToOrder } from "@/lib/server/orderFulfillment";

export async function GET(request: Request) {
  const id = getPathId(request);
  if (!id) return errorResponse("ID is required", 400);
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const sql = getDb();
  try {
    const rows = await sql`SELECT id, status, mollie_payment_id FROM orders WHERE id = ${id};`;
    if (rows.length === 0) return errorResponse("Order not found", 404);
    const order = rows[0] as { id: string; status: string; mollie_payment_id: string | null };

    // The webhook is the primary path, but it can be dropped or delayed. The
    // confirm page polls this endpoint, so use it to reconcile: fulfilment is
    // idempotent, so a late webhook afterwards is harmless.
    if (order.status === "pending" && order.mollie_payment_id) {
      try {
        await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
        const refreshed = await sql`SELECT status FROM orders WHERE id = ${id};`;
        return jsonResponse({ status: (refreshed[0]?.status as string) ?? order.status });
      } catch (reconcileErr) {
        console.error(`Reconciliation failed for order ${id}:`, reconcileErr);
      }
    }

    return jsonResponse({ status: order.status });
  } catch (err) {
    console.error("Failed to load order:", err);
    return errorResponse("Failed to load order", 500);
  }
}
