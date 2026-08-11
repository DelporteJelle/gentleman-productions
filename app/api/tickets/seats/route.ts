import { getDb, jsonResponse, errorResponse, getQueryParam, verifyAuth } from "@/lib/server/api";

interface SeatRow {
  id: string | null;
  status: string;
  held_until: string | null;
  seat_kind: string | null;
  wheelchair_group_id: string | null;
  seat_id: string;
  seat_row: string;
  seat_number: number;
}

function toSeatTicket(r: SeatRow) {
  return {
    id: r.id,
    status: r.status,
    held_until: r.held_until,
    seat_kind: r.seat_kind,
    wheelchair_group_id: r.wheelchair_group_id,
    seat: { id: r.seat_id, row: r.seat_row, seat_number: r.seat_number },
  };
}

export async function GET(request: Request) {
  const dateUuid = getQueryParam(request, "date_uuid");
  if (!dateUuid) return errorResponse("date_uuid required", 400);

  // A disabled seat must not exist as far as a customer is concerned — not
  // "present but unselectable". Withholding it here rather than hiding it in
  // the client means there is nothing on the wire to un-hide, and the seat map
  // renders a coordinate it holds no ticket for as an inert gap already.
  //
  // NOTE: this response now varies by cookie. It carries no Cache-Control
  // today; adding one without `Vary: Cookie` would let a shared cache serve an
  // admin payload to customers.
  const isAdmin = verifyAuth(request)?.role === "ADMIN";

  const sql = getDb();
  try {
    // The two queries are spelled out rather than composed from a shared
    // fragment: the Neon tagged-template API cannot splice raw SQL, and
    // smuggling the audience in as a bound boolean would make the security
    // boundary a runtime value instead of something you can read off the page.
    const rows = isAdmin
      ? await sql`
          SELECT CASE
                   WHEN t.status IN ('available','disabled')
                     OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now())
                   THEN t.id::text
                   ELSE NULL
                 END AS id,
                 t.status, t.held_until, t.seat_kind, t.wheelchair_group_id,
                 s.id AS seat_id, s."row" AS seat_row, s.seat_number
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.date_uuid = ${dateUuid};
        `
      : await sql`
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
          WHERE t.date_uuid = ${dateUuid}
            AND t.status <> 'disabled';
        `;
    return jsonResponse((rows as unknown as SeatRow[]).map(toSeatTicket));
  } catch (error) {
    console.error("Error fetching seats:", error);
    return errorResponse("Failed to fetch seats");
  }
}
