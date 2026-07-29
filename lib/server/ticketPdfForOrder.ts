import type { NeonQueryFunction } from "@neondatabase/serverless";
import { generateTicketsPdf, type TicketSeat, type TicketCommon } from "@/lib/generateTicketPdf";
import { signTicketToken } from "./ticketToken";
import type { Event, Order } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export type TicketPdfResult =
  | { kind: "not_found" }
  | { kind: "not_paid"; status: string }
  | { kind: "no_tickets" }
  | { kind: "ok"; buffer: Buffer; filename: string };

/** Filename-safe: strips everything but alphanumerics/spaces/hyphens, collapses runs. */
function sanitizeForFilename(title: string): string {
  const cleaned = title.replace(/[^A-Za-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned : "";
}

/**
 * Re-derives an order's tickets as a single multi-page PDF, straight from the
 * database — no caching, no storage. This intentionally mirrors the resend
 * route's read pattern so a PDF requested here always reflects the current
 * TICKET_QR_SECRET, the same way a re-sent email does. See
 * docs/superpowers/specs/2026-07-29-ticket-pdf-download-design.md for why a
 * stored/cached PDF was rejected (goes stale across secret rotation).
 */
export async function loadTicketsPdfForOrder(sql: Sql, orderId: string): Promise<TicketPdfResult> {
  const orderRows = await sql`SELECT * FROM orders WHERE id = ${orderId};`;
  const order = orderRows[0] as Order | undefined;
  if (!order) return { kind: "not_found" };

  if (order.status !== "paid") return { kind: "not_paid", status: order.status };

  // Read the authoritative sold set rather than trusting the order total —
  // same reasoning as the resend route: an order can be paid and hold no
  // seats if fulfilment lost them.
  const soldTickets = await sql`
    SELECT t.id, s."row" AS row, s.seat_number AS seat_number
    FROM tickets t JOIN seats s ON s.id = t.seat_id
    WHERE t.order_id = ${orderId} AND t.status = 'sold';
  `;
  if (soldTickets.length === 0) return { kind: "no_tickets" };

  const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = event?.dates?.find((d) => d.uuid === order.date_uuid);
  const eventName = event?.title ?? "Show";

  const d = date?.start_time ? new Date(date.start_time) : null;
  const dateStr = d
    ? d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const timeStr = d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

  const seats: TicketSeat[] = soldTickets.map((t) => ({
    seatLabel: `${t.row}${t.seat_number}`,
    qrPayload: signTicketToken(t.id),
  }));
  const common: TicketCommon = {
    eventName,
    date: dateStr,
    time: timeStr,
    productionTheme: event?.production_theme ?? null,
  };

  const buffer = await generateTicketsPdf(seats, common);

  const safeName = sanitizeForFilename(eventName);
  const filename = safeName ? `Tickets-${safeName}.pdf` : "Tickets.pdf";

  return { kind: "ok", buffer, filename };
}
