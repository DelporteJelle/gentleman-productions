import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Event } from "@/types";
import { isUuid, MAX_SEATS_PER_ORDER } from "./checkoutValidation";

type Sql = NeonQueryFunction<false, false>;

const MAX_ID_LENGTH = 100;

export interface AdminReserveInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
}

export type ValidationResult =
  | { ok: true; value: AdminReserveInput }
  | { ok: false; error: string };

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Same validation shape as validateCheckoutInput, minus name/email — admin
 * giveaway reservations collect no recipient info (per design decision).
 */
export function validateAdminReserveInput(body: Partial<AdminReserveInput> | null | undefined): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Select at least one seat." };
  if (ticketIds.length > MAX_SEATS_PER_ORDER)
    return { ok: false, error: `You can reserve at most ${MAX_SEATS_PER_ORDER} seats at once.` };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Invalid seat selection." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds } };
}

export type ReserveResult =
  | { ok: true; orderId: string }
  | { ok: false; status: number; error: string };

/**
 * Creates a paid, zero-amount order and claims the given tickets straight to
 * 'sold' — no hold, no Mollie. Deliberately does not check whether the date
 * is open for public sale: an admin may need to reserve seats (press, VIPs)
 * before the date goes on public sale.
 */
export async function reserveSeatsForAdmin(sql: Sql, input: AdminReserveInput): Promise<ReserveResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
  const event = events[0] as Event | undefined;
  if (!event) return { ok: false, status: 404, error: "Event not found" };
  const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
  if (!date) return { ok: false, status: 404, error: "Date not found" };

  const created = await sql`
    INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status, reserved_by_admin)
    VALUES (${eventUuid}, ${dateUuid}, 'Admin reservation', '', 0, 'paid', true)
    RETURNING id;
  `;
  const orderId = created[0].id as string;

  // Same atomic-claim shape as the checkout route, minus the hold/expiry
  // conditions: there is no payment window to protect, so a seat is either
  // available right now or it isn't.
  //
  // A wheelchair place IS giveable: an admin can hand one to a guest who
  // arranged it by email, without minting an access code. Only the anchor is
  // claimable, and only while available — its floor members are permanently
  // 'blocked', so `t.status = 'available'` excludes them on its own, and
  // naming the two allowed kinds keeps that from being the only thing
  // standing between a giveaway and a seat nobody can sit in.
  const claimed = await sql`
    UPDATE tickets t
       SET status = 'sold', order_id = ${orderId}
     WHERE t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND (t.seat_kind IS NULL OR t.seat_kind = 'wheelchair')
       AND t.status = 'available'
    RETURNING t.id;
  `;

  if (claimed.length !== ticketIds.length) {
    await sql`UPDATE tickets SET status = 'available', order_id = NULL WHERE order_id = ${orderId};`;
    await sql`DELETE FROM orders WHERE id = ${orderId};`;
    return { ok: false, status: 409, error: "One or more seats are no longer available." };
  }

  return { ok: true, orderId };
}

export type ReleaseResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Releases a single admin-reserved seat back to 'available'. Refuses to
 * touch any ticket whose order isn't reserved_by_admin — this check is the
 * only thing standing between this endpoint and cancelling a real
 * customer's paid seat.
 */
export async function releaseAdminReservedSeat(sql: Sql, ticketId: string): Promise<ReleaseResult> {
  const rows = await sql`
    SELECT t.id, t.status, t.order_id, o.reserved_by_admin
    FROM tickets t
    JOIN orders o ON o.id = t.order_id
    WHERE t.id = ${ticketId};
  `;
  const ticket = rows[0] as { id: string; status: string; order_id: string; reserved_by_admin: boolean } | undefined;
  if (!ticket || !ticket.reserved_by_admin) return { ok: false, status: 404, error: "Reserved seat not found" };
  if (ticket.status !== "sold") return { ok: false, status: 409, error: "This seat is not currently reserved." };

  const released = await sql`
    UPDATE tickets SET status = 'available', order_id = NULL, held_until = NULL, scanned_at = NULL
    WHERE id = ${ticketId} AND status = 'sold'
    RETURNING id;
  `;
  if (released.length === 0) return { ok: false, status: 409, error: "This seat was already released." };

  const remaining = await sql`
    SELECT 1 FROM tickets WHERE order_id = ${ticket.order_id} AND status IN ('sold', 'held') LIMIT 1;
  `;
  if (remaining.length === 0) {
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${ticket.order_id} AND status <> 'cancelled';`;
  }

  return { ok: true };
}
