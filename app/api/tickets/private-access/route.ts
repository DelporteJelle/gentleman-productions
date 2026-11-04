import { getDateAccess, readPrivateTicketToken, hashPrivateTicketToken } from "@/lib/server/privateTicketLinks";
import { errorResponse, getDb, jsonResponse, verifyAuth } from "@/lib/server/api";
import type { Event } from "@/types";
import { isDateOpen } from "@/lib/dateAvailability";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventUuid = url.searchParams.get("event_uuid");
  const dateUuid = url.searchParams.get("date_uuid");
  if (!eventUuid) return errorResponse("event_uuid required", 400);

  try {
    const sql = getDb();
    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    const user = verifyAuth(request);

    if (dateUuid) {
      const date = event.dates?.find((entry) => entry.uuid === dateUuid);
      if (!date) return errorResponse("Event date not found", 404);
      const access = user?.role === "ADMIN"
        ? { allowed: true, privateLinkId: null, tokenHash: null }
        : await getDateAccess(sql, request, event, date);
      return jsonResponse(
        { allowed: access.allowed, public: isDateOpen(event, date) },
        200,
        { "Cache-Control": "no-store" },
      );
    }

    const token = readPrivateTicketToken(request);
    if (!token) return jsonResponse({ authorizedDateUuid: null }, 200, { "Cache-Control": "no-store" });
    const tokenHash = hashPrivateTicketToken(token);
    const rows = await sql`
      SELECT date_uuid, token_hash, expires_at, revoked_at
        FROM private_ticket_links
       WHERE event_uuid = ${eventUuid} AND token_hash = ${tokenHash}
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
       LIMIT 1;
    `;
    const link = rows[0] as
      | { date_uuid: string; token_hash: string | null; expires_at: string | null; revoked_at: string | null }
      | undefined;
    const date = event.dates?.find((entry) => entry.uuid === link?.date_uuid);
    const authorizedDateUuid = link && date && typeof date.price === "number"
      ? link.date_uuid
      : null;
    return jsonResponse({ authorizedDateUuid }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Private ticket access status failed:", error);
    return errorResponse("Could not check private ticket access.");
  }
}
