import { getDb, jsonResponse, errorResponse, requireAuth, parseBody } from "@/lib/server/api";
import { verifyTicketToken } from "@/lib/server/ticketToken";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  // A missing secret would make every genuine ticket read as "invalid" at the
  // door, which is indistinguishable from mass fraud. Fail loudly instead.
  if (!process.env.TICKET_QR_SECRET) {
    console.error("Scan rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Scanner is misconfigured. Contact the site owner.", 500);
  }

  try {
    const sql = getDb();
    const { token } = await parseBody<{ token: string }>(request);
    if (!token) return jsonResponse({ result: "invalid", message: "No ticket code provided" });

    const ticketId = verifyTicketToken(token);
    if (!ticketId) return jsonResponse({ result: "invalid", message: "Not a valid ticket code" });

    const rows = await sql`
      SELECT t.id, t.status, t.scanned_at, t.event_uuid, t.date_uuid,
             s."row" AS row, s.seat_number
      FROM tickets t JOIN seats s ON s.id = t.seat_id
      WHERE t.id = ${ticketId};
    `;
    const ticket = rows[0];
    if (!ticket) return jsonResponse({ result: "invalid", message: "Ticket not found" });
    if (ticket.status !== "sold") return jsonResponse({ result: "invalid", message: "Ticket is not valid" });
    if (ticket.scanned_at)
      return jsonResponse({ result: "already_scanned", message: "Already scanned",
        scanned_at: ticket.scanned_at, seat: `${ticket.row}${ticket.seat_number}` });

    await sql`UPDATE tickets SET scanned_at = ${new Date().toISOString()} WHERE id = ${ticketId};`;

    const events = await sql`SELECT title FROM events WHERE uuid = ${ticket.event_uuid};`;
    return jsonResponse({ result: "valid", message: "Valid ticket!",
      seat: `${ticket.row}${ticket.seat_number}`, event: (events[0] as Event | undefined)?.title });
  } catch (err) {
    console.error("Scan failed:", err);
    return jsonResponse({ result: "invalid", message: "Scan failed" });
  }
}
