import type { NeonQueryFunction } from "@neondatabase/serverless";
import { generateTicketPdf } from "@/lib/generateTicketPdf";
import { signTicketToken } from "./ticketToken";
import type { Event } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export type SeatPdfResult =
  | { kind: "not_found" }
  | { kind: "ok"; buffer: Buffer; filename: string };

/**
 * Single-seat PDF for the admin dashboard's "Download QR" action — the
 * admin may come back days after reserving a seat, without the original
 * confirm-page link, and only wants that one seat re-rendered.
 */
export async function loadTicketPdfForReservedSeat(sql: Sql, ticketId: string): Promise<SeatPdfResult> {
  const rows = await sql`
    SELECT t.id, t.status, o.reserved_by_admin, s."row" AS row, s.seat_number AS seat_number,
           t.event_uuid, t.date_uuid
    FROM tickets t
    JOIN seats s ON s.id = t.seat_id
    JOIN orders o ON o.id = t.order_id
    WHERE t.id = ${ticketId};
  `;
  const row = rows[0] as
    | { id: string; status: string; reserved_by_admin: boolean; row: string; seat_number: number; event_uuid: string; date_uuid: string }
    | undefined;
  if (!row || !row.reserved_by_admin || row.status !== "sold") return { kind: "not_found" };

  const events = await sql`SELECT * FROM events WHERE uuid = ${row.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = event?.dates?.find((d) => d.uuid === row.date_uuid);
  const eventName = event?.title ?? "Show";

  const d = date?.start_time ? new Date(date.start_time) : null;
  const dateStr = d
    ? d.toLocaleDateString("nl-BE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const timeStr = d ? d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : "";

  const seatLabel = `${row.row}${row.seat_number}`;
  const buffer = await generateTicketPdf({
    seatLabel,
    qrPayload: signTicketToken(row.id),
    eventName,
    date: dateStr,
    time: timeStr,
    productionTheme: event?.production_theme ?? null,
  });

  return { kind: "ok", buffer, filename: `Ticket-${seatLabel}.pdf` };
}
