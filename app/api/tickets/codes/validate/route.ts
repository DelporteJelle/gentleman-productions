import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { normalizeCode } from "@/lib/ticketCodes";
import { isUuid } from "@/lib/server/checkoutValidation";
import { getDateAccess } from "@/lib/server/privateTicketLinks";
import type { Event } from "@/types";

/**
 * Advisory only. This endpoint GRANTS NOTHING and CONSUMES NOTHING — it exists
 * so the seat map can unlock a wheelchair place and show the discount before
 * the customer commits. `POST /api/tickets/checkout` re-reads and claims the
 * codes itself, and is the sole authority on both.
 */
export async function POST(request: Request) {
  const rate = checkRateLimit(`codes:${getClientIp(request)}`, 20, 15 * 60 * 1000);
  if (!rate.allowed) {
    return errorResponse("Te veel pogingen. Probeer het later opnieuw.", 429);
  }

  try {
    const body = await parseBody<{ eventUuid?: unknown; dateUuid?: unknown; code?: unknown }>(request);

    const eventUuid = typeof body?.eventUuid === "string" ? body.eventUuid.trim() : "";
    const dateUuid = typeof body?.dateUuid === "string" ? body.dateUuid.trim() : "";
    if (!isUuid(eventUuid)) return errorResponse("Deze code is niet geldig.", 404);
    if (!dateUuid) return errorResponse("Deze code is niet geldig.", 404);

    const code = normalizeCode(body?.code);
    if (!code) return errorResponse("Deze code is niet geldig.", 404);

    const sql = getDb();
    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((entry) => entry.uuid === dateUuid);
    if (!event || !date || !(await getDateAccess(sql, request, event, date)).allowed) {
      return errorResponse("Deze code is niet geldig.", 404);
    }
    const rows = await sql`
      SELECT kind, revoked_at, used_by_order_id
        FROM ticket_codes
       WHERE code = ${code} AND event_uuid = ${eventUuid};
    `;
    const found = rows[0] as
      | { kind: string; revoked_at: string | null; used_by_order_id: string | null }
      | undefined;

    if (!found || found.revoked_at) return errorResponse("Deze code is niet geldig.", 404);
    // Distinguished on purpose: a brute-forcer learns nothing here they could
    // not learn by trying the code at checkout, and someone who mistyped
    // deserves to know which problem they have.
    if (found.used_by_order_id) return errorResponse("Deze code is al gebruikt.", 409);

    return jsonResponse({ kind: found.kind });
  } catch (err) {
    console.error("Code validation failed:", err);
    return errorResponse("Kon de code niet controleren. Probeer opnieuw.", 500);
  }
}
