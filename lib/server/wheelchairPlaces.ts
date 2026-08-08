import { randomUUID } from "crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { isUuid } from "./checkoutValidation";
import { pickAnchor, formatPlaceLabel } from "@/lib/wheelchairPlaces";

type Sql = NeonQueryFunction<false, false>;

const MAX_ID_LENGTH = 100;

/**
 * How many seats one wheelchair place may cover. Deliberately NOT
 * MAX_SEATS_PER_ORDER — that constant bounds how many tickets one customer may
 * buy and has no bearing on how much floor a chair takes.
 */
export const MAX_SEATS_PER_PLACE = 40;

export interface CreatePlaceInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
}

export type ValidationResult =
  | { ok: true; value: CreatePlaceInput }
  | { ok: false; error: string };

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** Same validation shape as validateAdminReserveInput, with its own seat cap. */
export function validateCreatePlaceInput(
  body: Partial<CreatePlaceInput> | null | undefined,
): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Selecteer minstens één stoel." };
  if (ticketIds.length > MAX_SEATS_PER_PLACE)
    return { ok: false, error: `Een rolstoelplaats kan hoogstens ${MAX_SEATS_PER_PLACE} stoelen beslaan.` };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Ongeldige stoelselectie." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds } };
}

export type CreateResult =
  | { ok: true; groupId: string; anchorTicketId: string; label: string }
  | { ok: false; status: number; error: string };

/**
 * Convert a set of seats on one performance into a wheelchair place.
 *
 * Deliberately does NOT check `isDateOpen`: an admin configures the room
 * before the date goes on public sale. Same divergence, for the same reason,
 * as `reserveSeatsForAdmin`.
 *
 * There is no separate event/date existence check either — the claim below
 * filters on both, so a wrong event simply matches nothing and 409s.
 */
export async function createWheelchairPlace(sql: Sql, input: CreatePlaceInput): Promise<CreateResult> {
  const { eventUuid, dateUuid, ticketIds } = input;

  // Minted here, not read back, so both statements below can reference it —
  // the Neon HTTP driver has no interactive transactions to share state
  // through.
  const groupId = randomUUID();

  const revert = async () => {
    await sql`
      UPDATE tickets
         SET wheelchair_group_id = NULL, seat_kind = NULL, status = 'available'
       WHERE wheelchair_group_id = ${groupId};
    `;
  };

  try {
    // Single-statement claim. Every precondition lives in the WHERE clause and
    // the row count in RETURNING tells us whether we won the race.
    const claimed = await sql`
      UPDATE tickets t
         SET wheelchair_group_id = ${groupId},
             seat_kind = 'wheelchair_floor',
             status = 'blocked'
        FROM seats s
       WHERE s.id = t.seat_id
         AND t.id = ANY(${ticketIds})
         AND t.event_uuid = ${eventUuid}
         AND t.date_uuid = ${dateUuid}
         AND t.status = 'available'
         AND t.seat_kind IS NULL
      RETURNING t.id, s."row" AS row, s.seat_number AS seat_number;
    `;

    if (claimed.length !== ticketIds.length) {
      await revert();
      return { ok: false, status: 409, error: "Eén of meer stoelen zijn niet meer vrij." };
    }

    const members = claimed as unknown as { id: string; row: string; seat_number: number }[];
    const anchor = pickAnchor(members)!;

    await sql`
      UPDATE tickets SET seat_kind = 'wheelchair', status = 'available'
       WHERE id = ${anchor.id} AND wheelchair_group_id = ${groupId};
    `;

    return { ok: true, groupId, anchorTicketId: anchor.id, label: formatPlaceLabel(members) };
  } catch (err) {
    // Without this, a failure between the claim and the anchor promotion would
    // leave a place made entirely of floor seats — no anchor, therefore nothing
    // to click, therefore no way to revert it from the UI.
    try {
      await revert();
    } catch (revertErr) {
      console.error("Wheelchair place compensation failed:", revertErr);
    }
    throw err;
  }
}

export type RevertResult =
  | { ok: true; released: number }
  | { ok: false; status: number; error: string };

/**
 * Dissolve a place back into ordinary seats.
 *
 * One statement carrying its own refusal, so there is no read-then-write race.
 * `status IN ('available','blocked')` bounds the blast radius the same way
 * `expirePendingOrder` uses `AND status = 'held'`: a sold ticket carrying this
 * group id must never be silently un-sold.
 */
export async function revertWheelchairPlace(sql: Sql, groupId: string): Promise<RevertResult> {
  const released = await sql`
    UPDATE tickets
       SET wheelchair_group_id = NULL, seat_kind = NULL, status = 'available'
     WHERE wheelchair_group_id = ${groupId}
       AND status IN ('available','blocked')
       AND NOT EXISTS (
             SELECT 1 FROM tickets inner_t
              WHERE inner_t.wheelchair_group_id = ${groupId}
                AND inner_t.status IN ('held','sold'))
    RETURNING id;
  `;

  // Zero rows means either the group doesn't exist or it is in use. The caller
  // cannot distinguish, and does not need to.
  if (released.length === 0)
    return { ok: false, status: 409, error: "Deze rolstoelplaats is in gebruik en kan niet teruggezet worden." };

  return { ok: true, released: released.length };
}
