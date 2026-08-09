import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isUuid } from "./checkoutValidation";

type Sql = NeonQueryFunction<false, false>;

const MAX_ID_LENGTH = 100;

/**
 * How many seats one disable/enable call may cover. Deliberately NOT
 * MAX_SEATS_PER_ORDER (20) — that constant bounds how many tickets one
 * customer may buy and says nothing about how much of a room an admin may
 * take out of service. Matches MAX_SEATS_PER_PLACE, sized for the same reason.
 */
export const MAX_SEATS_PER_TOGGLE = 40;

export interface SeatToggleInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
}

export type ValidationResult =
  | { ok: true; value: SeatToggleInput }
  | { ok: false; error: string };

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** Same validation shape as validateCreatePlaceInput, with its own seat cap. */
export function validateSeatToggleInput(
  body: Partial<SeatToggleInput> | null | undefined,
): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Selecteer minstens één stoel." };
  if (ticketIds.length > MAX_SEATS_PER_TOGGLE)
    return {
      ok: false,
      error: `Je kan hoogstens ${MAX_SEATS_PER_TOGGLE} stoelen tegelijk aanpassen.`,
    };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Ongeldige stoelselectie." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds } };
}

export type ToggleResult =
  | { ok: true; changed: number }
  | { ok: false; status: number; error: string };

/**
 * Put back exactly the rows a partial claim managed to move.
 *
 * The Neon HTTP driver has no interactive transactions, so this is
 * compensation rather than rollback — but it is exact rather than
 * best-effort: RETURNING named precisely the rows that changed. `AND status =
 * ${from}` keeps it from touching a row somebody else has moved since.
 *
 * A failure here is re-thrown rather than swallowed: the seats are stuck and
 * the caller's 409 would be a lie. The log names the ids so recovery is a
 * copy-paste rather than a hunt.
 */
async function revertStatus(sql: Sql, ids: string[], from: string, to: string): Promise<void> {
  if (ids.length === 0) return;
  try {
    await sql`
      UPDATE tickets SET status = ${to}
       WHERE id = ANY(${ids}) AND status = ${from};
    `;
  } catch (err) {
    console.error(
      `Seat availability compensation failed — tickets stuck in '${from}': ${ids.join(", ")}`,
      err,
    );
    throw err;
  }
}

/**
 * Take a set of ordinary free seats out of service.
 *
 * Deliberately does NOT check whether the date is open for public sale: an
 * admin configures the room before and during sale. Same divergence, for the
 * same reason, as `reserveSeatsForAdmin` and `createWheelchairPlace`.
 */
export async function disableSeats(sql: Sql, input: SeatToggleInput): Promise<ToggleResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  // Single-statement claim: every precondition lives in the WHERE clause and
  // the RETURNING row count says whether we got all of them.
  //
  // `t.seat_kind IS NULL` is what keeps a wheelchair anchor out. An anchor is
  // status='available', so without this an admin could disable one and leave a
  // place with no sellable member — and the seats API withholds ids for
  // anything not available, so there would be nothing left to click to undo it.
  //
  // `t.status = 'available'` deliberately does NOT extend to lapsed holds
  // (matching reserveSeatsForAdmin, not the checkout claim): a lapsed hold
  // still carries an order_id, and moving it to 'disabled' would leave the
  // expiry sweep — `WHERE order_id = ... AND status = 'held'` — unable to find
  // it, stranding a pending order with no tickets.
  const changed = await sql`
    UPDATE tickets t
       SET status = 'disabled'
     WHERE t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND t.seat_kind IS NULL
       AND t.status = 'available'
    RETURNING t.id;
  `;

  if (changed.length !== ticketIds.length) {
    await revertStatus(sql, changed.map((r) => r.id as string), "disabled", "available");
    return { ok: false, status: 409, error: "Eén of meer stoelen zijn niet meer vrij." };
  }

  return { ok: true, changed: changed.length };
}

/** Put a set of disabled seats back on sale. */
export async function enableSeats(sql: Sql, input: SeatToggleInput): Promise<ToggleResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  // `t.status = 'disabled'` is the whole safety story: whatever ids this is
  // handed, it can only ever move rows OUT of 'disabled' — never un-sell or
  // un-hold anything. `t.seat_kind IS NULL` is defence in depth; a place
  // member can never be 'disabled' in the first place.
  const changed = await sql`
    UPDATE tickets t
       SET status = 'available'
     WHERE t.id = ANY(${ticketIds})
       AND t.event_uuid = ${eventUuid}
       AND t.date_uuid = ${dateUuid}
       AND t.seat_kind IS NULL
       AND t.status = 'disabled'
    RETURNING t.id;
  `;

  if (changed.length !== ticketIds.length) {
    await revertStatus(sql, changed.map((r) => r.id as string), "available", "disabled");
    return { ok: false, status: 409, error: "Eén of meer stoelen zijn niet uitgeschakeld." };
  }

  return { ok: true, changed: changed.length };
}
