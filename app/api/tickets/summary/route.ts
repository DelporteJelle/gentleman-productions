import { getDb, jsonResponse, requireRole } from "@/lib/server/api";

export async function GET(request: Request) {
  const authError = requireRole(request, ["ADMIN", "SCANNER"]);
  if (authError) return authError;
  const sql = getDb();

  const perDate = await sql`
    SELECT t.event_uuid, t.date_uuid,
      COUNT(*) FILTER (WHERE t.status = 'sold')      AS sold,
      COUNT(*) FILTER (WHERE t.status = 'held')      AS held,
      -- Narrowed to seats a customer can actually buy: a wheelchair anchor is
      -- 'available' but not purchasable, so counting it here would overstate
      -- what is left.
      COUNT(*) FILTER (WHERE t.status = 'available' AND t.seat_kind IS NULL) AS available,
      COUNT(*) FILTER (WHERE t.seat_kind = 'wheelchair') AS wheelchair,
      COUNT(*) FILTER (WHERE t.status = 'blocked')   AS blocked,
      COUNT(*) AS total
    FROM tickets t GROUP BY t.event_uuid, t.date_uuid;
  `;
  const orders = await sql`
    SELECT o.id, o.customer_name, o.customer_email, o.total_amount, o.status,
           o.created_at, o.event_uuid
    FROM orders o WHERE o.reserved_by_admin = false ORDER BY o.created_at DESC LIMIT 100;
  `;
  const reserved = await sql`
    SELECT t.id AS ticket_id, s."row" AS row, s.seat_number AS seat_number,
           t.event_uuid, t.date_uuid, o.created_at
    FROM tickets t
    JOIN seats s ON s.id = t.seat_id
    JOIN orders o ON o.id = t.order_id
    WHERE t.status = 'sold' AND o.reserved_by_admin = true
    ORDER BY o.created_at DESC;
  `;
  const events = await sql`SELECT uuid, title, dates FROM events;`;

  const byUuid = Object.fromEntries(events.map((e) => [e.uuid, e]));
  const dates = perDate.map((d) => {
    const ev = byUuid[d.event_uuid];
    const de = ev?.dates?.find((x: { uuid: string }) => x.uuid === d.date_uuid);
    return { ...d, title: ev?.title ?? "—", start_time: de?.start_time ?? null };
  });
  const orderRows = orders.map((o) => ({ ...o, event_title: byUuid[o.event_uuid]?.title ?? "—" }));
  const reservedSeats = reserved.map((r) => {
    const ev = byUuid[r.event_uuid];
    const de = ev?.dates?.find((x: { uuid: string }) => x.uuid === r.date_uuid);
    return {
      ticket_id: r.ticket_id,
      seat_label: `${r.row}${r.seat_number}`,
      event_title: ev?.title ?? "—",
      start_time: de?.start_time ?? null,
      reserved_at: r.created_at,
    };
  });

  return jsonResponse({ dates, orders: orderRows, reservedSeats });
}
