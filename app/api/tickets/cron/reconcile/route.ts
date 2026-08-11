import { getDb, jsonResponse, errorResponse } from "@/lib/server/api";
import { reconcileStuckOrders } from "@/lib/server/orderFulfillment";

/**
 * Scheduled backstop (see vercel.json) for orders stuck 'pending' because
 * both automatic paths missed them: the webhook was dropped/delayed, and the
 * customer's browser never completed the confirm-page poll (closed tab,
 * connectivity loss, interrupted redirect). Without this, such an order has
 * no path left that ever re-checks Mollie.
 *
 * Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET` when
 * that env var is set on the project — verified below. Fails closed (503) if
 * the secret isn't configured, same policy as TICKET_QR_SECRET: an
 * unauthenticated sweep endpoint would let anyone trigger Mollie API calls
 * for every stuck order on demand.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("Reconcile sweep rejected: CRON_SECRET is not configured");
    return errorResponse("Not configured", 503);
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return errorResponse("Unauthorized", 401);
  }

  const sql = getDb();
  try {
    const { checked, results } = await reconcileStuckOrders(sql);
    const paid = results.filter((r) => r === "paid").length;
    const released = results.filter((r) => r === "released").length;
    console.info(`Reconcile sweep: checked ${checked}, paid ${paid}, released ${released}`);
    return jsonResponse({ checked, paid, released });
  } catch (err) {
    console.error("Reconcile sweep failed:", err);
    return errorResponse("Reconcile sweep failed", 500);
  }
}
