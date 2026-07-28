import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import { verifyTicketToken } from "@/lib/server/ticketToken";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
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
             s."row" AS row, s.seat_number,
             e.title AS event_title
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      LEFT JOIN events e ON e.uuid::text = t.event_uuid
      WHERE t.id = ${ticketId};
    `;
    const ticket = rows[0];
    if (!ticket) return jsonResponse({ result: "invalid", message: "Ticket not found" });

    const seat = `${ticket.row}${ticket.seat_number}`;
    if (ticket.status !== "sold")
      return jsonResponse({ result: "invalid", message: "Ticket is not valid", seat });

    // The update is the test: exactly one concurrent scanner gets a row back.
    const claimed = await sql`
      UPDATE tickets SET scanned_at = now()
      WHERE id = ${ticketId} AND status = 'sold' AND scanned_at IS NULL
      RETURNING scanned_at;
    `;

    if (claimed.length === 0) {
      const current = await sql`SELECT scanned_at FROM tickets WHERE id = ${ticketId};`;
      return jsonResponse({
        result: "already_scanned",
        message: "Already scanned",
        scanned_at: current[0]?.scanned_at ?? ticket.scanned_at,
        seat,
      });
    }

    return jsonResponse({
      result: "valid",
      message: "Valid ticket!",
      seat,
      event: ticket.event_title ?? undefined,
    });
  } catch (err) {
    console.error("Scan failed:", err);
    return jsonResponse({ result: "invalid", message: "Scan failed" });
  }
}
