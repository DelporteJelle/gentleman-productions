import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse, getDb, jsonResponse, parseBody } from "@/lib/server/api";
import {
  hashPrivateTicketToken,
  PRIVATE_LINK_SESSION_SECONDS,
  PRIVATE_TICKET_COOKIE,
} from "@/lib/server/privateTicketLinks";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const rate = checkRateLimit(`private-link:${getClientIp(request)}`, 120, 15 * 60 * 1000);
  if (!rate.allowed) return errorResponse("Too many attempts. Please try again later.", 429);

  try {
    const body = await parseBody<{ token?: unknown }>(request);
    const token = typeof body?.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      return errorResponse("This private ticket link is invalid or has expired.", 404);
    }
    const tokenHash = hashPrivateTicketToken(token);
    const sql = getDb();
    const rows = await sql`
      SELECT id, event_uuid, date_uuid, expires_at
        FROM private_ticket_links
       WHERE token_hash = ${tokenHash}
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
       LIMIT 1;
    `;
    const link = rows[0] as
      | { id: string; event_uuid: string; date_uuid: string; expires_at: string | null }
      | undefined;
    if (!link) return errorResponse("This private ticket link is invalid or has expired.", 404);

    const events = await sql`SELECT * FROM events WHERE uuid = ${link.event_uuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((entry) => entry.uuid === link.date_uuid);
    if (!event || !date || typeof date.price !== "number") {
      return errorResponse("This private ticket link is invalid or has expired.", 404);
    }

    let maxAge = PRIVATE_LINK_SESSION_SECONDS;
    if (link.expires_at) {
      maxAge = Math.min(maxAge, Math.max(0, Math.floor((Date.parse(link.expires_at) - Date.now()) / 1000)));
    }
    if (maxAge < 1) return errorResponse("This private ticket link is invalid or has expired.", 404);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const cookie = `${PRIVATE_TICKET_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
    return jsonResponse(
      { eventUuid: link.event_uuid, dateUuid: link.date_uuid },
      200,
      { "Cache-Control": "no-store", "Set-Cookie": cookie },
    );
  } catch (error) {
    console.error("Private ticket link redemption failed:", error);
    return errorResponse("Could not open this private ticket link.");
  }
}
