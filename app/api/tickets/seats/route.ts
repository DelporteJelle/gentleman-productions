import { getDb, jsonResponse, errorResponse, getQueryParam } from "@/lib/server/api";

export async function GET(request: Request) {
  const dateUuid = getQueryParam(request, "date_uuid");
  if (!dateUuid) return errorResponse("date_uuid required", 400);

  const sql = getDb();
  try {
    const rows = await sql`
      SELECT t.id, t.status, t.held_until,
             s.id AS seat_id, s."row" AS seat_row,
             s.seat_number, s.reserved_for
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      WHERE t.date_uuid = ${dateUuid};
    `;
    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      held_until: r.held_until,
      seat: {
        id: r.seat_id,
        row: r.seat_row,
        seat_number: r.seat_number,
        reserved_for: r.reserved_for,
      },
    }));
    return jsonResponse(data);
  } catch (error) {
    console.error("Error fetching seats:", error);
    return errorResponse("Failed to fetch seats");
  }
}
