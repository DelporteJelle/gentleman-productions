import { getDb, jsonResponse, errorResponse } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { loadOrderView } from "@/lib/server/orderView";

/**
 * Public order status, guarded by possession of the unguessable order UUID —
 * the same trust model as the ticket PDF download. Rate-limited because the
 * saved-order banner polls it on page load and it can reach Mollie.
 *
 * Deliberately returns no customer name or email: the browser already holds
 * what it submitted, and an order UUID should disclose no more than a
 * forwarded confirmation email does.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`order-view:${clientIp}`, 120, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return errorResponse("Te veel aanvragen. Probeer het straks opnieuw.", 429);
  }

  try {
    const view = await loadOrderView(getDb(), id);
    if (!view) return errorResponse("Order not found", 404);
    return jsonResponse(view);
  } catch (err) {
    console.error("Failed to load order:", err);
    return errorResponse("Failed to load order", 500);
  }
}
