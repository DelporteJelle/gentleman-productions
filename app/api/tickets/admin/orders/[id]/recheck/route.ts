import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { applyMolliePaymentToOrder } from "@/lib/server/orderFulfillment";
import type { Order } from "@/types";

/**
 * Admin-only manual fallback for an order stuck 'pending' despite the
 * customer having actually paid — the webhook and the confirm-page poll are
 * the two automatic reconciliation paths, but both depend on something
 * outside the server (webhook delivery, the customer's browser staying on
 * the confirm page). If a customer reports paying with nothing to show for
 * it, this re-queries Mollie right now instead of waiting on the next
 * scheduled sweep.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const sql = getDb();
  try {
    const orderRows = await sql`SELECT * FROM orders WHERE id = ${id};`;
    const order = orderRows[0] as Order | undefined;
    if (!order) return errorResponse("Order not found", 404);

    if (!order.mollie_payment_id) {
      return errorResponse("This order has no Mollie payment to check.", 409);
    }

    await applyMolliePaymentToOrder(sql, order.mollie_payment_id);

    const refreshed = await sql`
      SELECT status,
             EXISTS(SELECT 1 FROM tickets WHERE order_id = ${id} AND status = 'sold') AS has_tickets
      FROM orders WHERE id = ${id};
    `;
    return jsonResponse({
      status: refreshed[0]?.status as string,
      has_tickets: refreshed[0]?.has_tickets as boolean,
    });
  } catch (err) {
    console.error(`Admin recheck failed for order ${id}:`, err);
    return errorResponse("Could not recheck this order. Please try again.", 500);
  }
}
