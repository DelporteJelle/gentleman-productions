import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Event, EventDateEntry } from "@/types";
import { venueSeats } from "@/lib/venue";

type Sql = NeonQueryFunction<false, false>;

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}
export function centsToEuros(cents: number): number {
  return cents / 100;
}
export function isDateOpen(event: Event, date: EventDateEntry): boolean {
  return event.tickets_open === true && typeof date.price === "number";
}

/**
 * For each open date of the event, ensure one `tickets` row exists per venue seat.
 * Idempotent: existing (date_uuid, seat_id) rows are left untouched.
 */
export async function provisionTicketsForEvent(sql: Sql, event: Event): Promise<void> {
  const openDates = (event.dates ?? []).filter((d) => isDateOpen(event, d));
  if (openDates.length === 0) return;
  const seatRows = await sql`SELECT id FROM seats;`;
  const seatIds = seatRows.map((r) => r.id as string);
  for (const date of openDates) {
    for (const seatId of seatIds) {
      await sql`
        INSERT INTO tickets (event_uuid, date_uuid, seat_id, status)
        VALUES (${event.uuid}, ${date.uuid}, ${seatId}, 'available')
        ON CONFLICT (date_uuid, seat_id) DO NOTHING;
      `;
    }
  }
}
