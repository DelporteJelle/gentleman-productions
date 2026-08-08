import { getDb, jsonResponse, errorResponse, getQueryParam } from "@/lib/server/api";

export async function GET(request: Request) {
  const dateUuid = getQueryParam(request, "date_uuid");
  if (!dateUuid) return errorResponse("date_uuid required", 400);

  const sql = getDb();
  try {
    const rows = await sql`
      SELECT CASE
               WHEN t.status = 'available'
                 OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now())
               THEN t.id::text
               ELSE NULL
             END AS id,
             t.status, t.held_until, t.seat_kind, t.wheelchair_group_id,
             s.id AS seat_id, s."row" AS seat_row, s.seat_number
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      WHERE t.date_uuid = ${dateUuid};
    `;
    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      held_until: r.held_until,
      seat_kind: r.seat_kind,
      wheelchair_group_id: r.wheelchair_group_id,
      seat: {
        id: r.seat_id,
        row: r.seat_row,
        seat_number: r.seat_number,
      },
    }));
    return jsonResponse(data);
  } catch (error) {
    console.error("Error fetching seats:", error);
    return errorResponse("Failed to fetch seats");
  }
}
