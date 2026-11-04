import { randomUUID } from "node:crypto";
import type { Event } from "@/types";
import { isDateOpen } from "@/lib/dateAvailability";
import {
  createPrivateTicketToken,
  hashPrivateTicketToken,
  type PrivateTicketLinkRow,
} from "@/lib/server/privateTicketLinks";
import {
  errorResponse,
  getDb,
  jsonResponse,
  parseBody,
  requireRole,
  verifyAuth,
} from "@/lib/server/api";

export async function GET(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;
  const url = new URL(request.url);
  const eventUuid = url.searchParams.get("event_uuid");
  const dateUuid = url.searchParams.get("date_uuid");
  if (!eventUuid || !dateUuid) return errorResponse("event_uuid and date_uuid required", 400);

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, event_uuid, date_uuid, created_at, expires_at, revoked_at,
             ticket_limit, allocated_tickets,
             (token_hash IS NOT NULL AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())) AS active
        FROM private_ticket_links
       WHERE event_uuid = ${eventUuid} AND date_uuid = ${dateUuid};
    `;
    return jsonResponse({ link: rows[0] ?? null }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Private ticket link status failed:", error);
    return errorResponse("Could not load private ticket link.");
  }
}

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const body = await parseBody<{
      eventUuid?: unknown;
      dateUuid?: unknown;
      expiresAt?: unknown;
      ticketLimit?: unknown;
    }>(request);
    const eventUuid = typeof body.eventUuid === "string" ? body.eventUuid : "";
    const dateUuid = typeof body.dateUuid === "string" ? body.dateUuid : "";
    if (!eventUuid || !dateUuid) return errorResponse("Event and date are required.", 400);

    let expiresAt: string | null = null;
    if (body.expiresAt !== null && body.expiresAt !== undefined && body.expiresAt !== "") {
      const parsed = new Date(String(body.expiresAt));
      if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        return errorResponse("Expiry must be a future date and time.", 400);
      }
      expiresAt = parsed.toISOString();
    }

    let ticketLimit: number | null = null;
    if (body.ticketLimit !== null && body.ticketLimit !== undefined && body.ticketLimit !== "") {
      if (typeof body.ticketLimit !== "number") {
        return errorResponse("Ticket limit must be a positive whole number.", 400);
      }
      const parsed = body.ticketLimit;
      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        return errorResponse("Ticket limit must be a positive whole number.", 400);
      }
      ticketLimit = parsed;
    }

    const sql = getDb();
    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((entry) => entry.uuid === dateUuid);
    if (!event || !date) return errorResponse("Event date not found.", 404);
    if (isDateOpen(event, date) || typeof date.price !== "number") {
      return errorResponse("Private links are available for closed, priced dates.", 409);
    }

    const token = createPrivateTicketToken();
    const tokenHash = hashPrivateTicketToken(token);
    const id = randomUUID();
    const user = verifyAuth(request);
    const rows = await sql`
      INSERT INTO private_ticket_links (
        id, event_uuid, date_uuid, token_hash, created_at, created_by,
        expires_at, revoked_at, ticket_limit, allocated_tickets
      ) VALUES (
        ${id}, ${eventUuid}, ${dateUuid}, ${tokenHash}, now(), ${user?.id ?? null},
        ${expiresAt}, NULL, ${ticketLimit}, 0
      )
      ON CONFLICT (event_uuid, date_uuid) DO UPDATE SET
        token_hash = EXCLUDED.token_hash,
        created_at = now(),
        created_by = EXCLUDED.created_by,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        ticket_limit = EXCLUDED.ticket_limit
      WHERE EXCLUDED.ticket_limit IS NULL
         OR private_ticket_links.allocated_tickets <= EXCLUDED.ticket_limit
      RETURNING id, event_uuid, date_uuid, created_at, expires_at, revoked_at,
                ticket_limit, allocated_tickets;
    `;
    const row = rows[0] as PrivateTicketLinkRow | undefined;
    if (!row) {
      return errorResponse(
        "The new limit is below tickets already sold or held through this private link.",
        409,
      );
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
    return jsonResponse(
      { link: { ...row, active: true }, url: `${baseUrl}/private-ticket#token=${token}` },
      201,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    console.error("Private ticket link creation failed:", error);
    return errorResponse("Could not create private ticket link.");
  }
}
