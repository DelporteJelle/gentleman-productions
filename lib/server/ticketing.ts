import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Event } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}
export function centsToEuros(cents: number): number {
  return cents / 100;
}

/**
 * For each priced date of the event, ensure one `tickets` row exists per venue
 * seat. Idempotent: existing (date_uuid, seat_id) rows are left untouched.
 *
 * Deliberately keyed on the price rather than on whether the date is on sale:
 * seats are the room, not the sale. An admin needs to disable seats and place
 * wheelchair spots on a date that is still closed — a rehearsal day held back
 * until the other dates sell out — and opening it should then be an instant
 * flip rather than a wait for provisioning. Closed dates stay unreachable to
 * customers through `isDateOpen`, which gates the seat map and checkout.
 */
export async function provisionTicketsForEvent(sql: Sql, event: Event): Promise<void> {
  const pricedDates = (event.dates ?? []).filter(
    (d) => typeof d.price === "number",
  );
  if (pricedDates.length === 0) return;
  const seatRows = await sql`SELECT id FROM seats;`;
  const seatIds = seatRows.map((r) => r.id as string);
  if (seatIds.length === 0) {
    // The venue must be seeded (`npm run seed:venue`) before tickets can be
    // provisioned. Without seats this silently creates nothing, which surfaces
    // downstream as an empty (all-black) seat map — so fail loudly here.
    console.warn(
      `provisionTicketsForEvent: event "${event.title}" (${event.uuid}) has ` +
        `${pricedDates.length} priced date(s) but the seats table is empty — no tickets ` +
        `were created. Run \`npm run seed:venue\` to seed the venue.`,
    );
    return;
  }
  // One statement per date, filled straight from the seats table, rather than
  // one per seat. This runs inside the events POST/PUT before the response is
  // sent, and a round trip per seat put a full venue at ~780 sequential
  // queries — some 23 seconds, past the serverless timeout — so an admin saw
  // no confirmation and the client never got to invalidate its caches.
  for (const date of pricedDates) {
    await sql`
      INSERT INTO tickets (event_uuid, date_uuid, seat_id, status)
      SELECT ${event.uuid}, ${date.uuid}, seats.id, 'available'
      FROM seats
      ON CONFLICT (date_uuid, seat_id) DO NOTHING;
    `;
  }
}
