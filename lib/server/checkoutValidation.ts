/**
 * Input validation for POST /api/tickets/checkout.
 *
 * Everything here is pure so it can be unit-tested without a database. The
 * uuid check is not cosmetic: `tickets.id` is a Postgres `uuid` column, so an
 * unvalidated value reaches the driver and raises `invalid input syntax for
 * type uuid`, which would surface as a 500.
 */

import { normalizeCodeList } from "./ticketCodes";

export const MAX_SEATS_PER_ORDER = 20;
export const MAX_NAME_LENGTH = 120;
export const MAX_EMAIL_LENGTH = 254;
const MAX_ID_LENGTH = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CheckoutInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
  name: string;
  email: string;
  codes: string[];
}

export type ValidationResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; error: string };

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

export function validateCheckoutInput(body: Partial<CheckoutInput> | null | undefined): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };

  // `events.uuid` is a Postgres `uuid` column, so a malformed value reaches
  // the driver and raises `invalid input syntax for type uuid` — a generic
  // 500 where the caller deserves a clean rejection. `dateUuid` is compared
  // against `text` columns and is deliberately NOT constrained here.
  if (!isUuid(eventUuid)) return { ok: false, error: "Invalid event." };

  const name = nonEmptyString(body.name, MAX_NAME_LENGTH);
  if (!name) return { ok: false, error: `Please enter a name of at most ${MAX_NAME_LENGTH} characters.` };

  const email = nonEmptyString(body.email, MAX_EMAIL_LENGTH);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Select at least one seat." };
  if (ticketIds.length > MAX_SEATS_PER_ORDER)
    return { ok: false, error: `You can book at most ${MAX_SEATS_PER_ORDER} seats in one order.` };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Invalid seat selection." };

  const codeList = normalizeCodeList((body as { codes?: unknown }).codes);
  if (!codeList.ok) return { ok: false, error: codeList.error };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds, name, email, codes: codeList.codes } };
}
