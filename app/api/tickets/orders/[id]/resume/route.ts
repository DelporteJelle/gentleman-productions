import { jsonResponse, errorResponse, getDb } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { resumeOrder } from "@/lib/server/orderResume";

/**
 * Continue an abandoned checkout. Guarded, like the PDF route, by possession
 * of the unguessable order UUID — it grants no more than a forwarded
 * confirmation email already would. Rate-limited on top of that because each
 * call can reach Mollie and may create a payment.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`resume:${clientIp}`, 20, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return errorResponse("Te veel pogingen. Probeer het straks opnieuw.", 429);
  }

  try {
    const result = await resumeOrder(getDb(), id);
    if (result.state === "not_found") return errorResponse("Order not found", 404);
    if (result.state === "checkout") return jsonResponse({ checkoutUrl: result.checkoutUrl });
    return jsonResponse({ state: result.state });
  } catch (err) {
    console.error(`Resume failed for order ${id}:`, err);
    return errorResponse("Kon je bestelling niet hervatten. Probeer het opnieuw.", 500);
  }
}
