import { randomBytes } from "crypto";

/**
 * Pure helpers for access and free-ticket codes, shared by the browser and the
 * API routes. Kept out of `lib/server/` deliberately — the seat page needs to
 * normalise input before sending it, and `lib/server/*` pulls in the Neon
 * driver.
 */

export type CodeKind = "wheelchair" | "free_ticket";
export type CodeState = "unused" | "in_use" | "used" | "revoked";

/**
 * 30 symbols. I, L, O, U, 0 and 1 are omitted so a code read off a screen or a
 * printed slip cannot be mistyped into a different valid code. 10 characters
 * of this gives about 49 bits — the entropy is what actually protects these,
 * since they are stored in plaintext so the admin can read them back.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

const BODY_LENGTH = 10;
const PREFIX = "GP";

function format(body: string): string {
  return `${PREFIX}-${body.slice(0, 5)}-${body.slice(5)}`;
}

/**
 * Canonical form of whatever the user typed, or null if it cannot be one.
 *
 * Accepts the full `GP-XXXXX-XXXXX`, a bare 10-character body, and any
 * casing/spacing/punctuation around either. Length disambiguates the two
 * accepted shapes, so a body that happens to start with "GP" is never
 * mistaken for a prefix.
 */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const stripped = value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  let body: string;
  if (stripped.length === PREFIX.length + BODY_LENGTH && stripped.startsWith(PREFIX)) {
    body = stripped.slice(PREFIX.length);
  } else if (stripped.length === BODY_LENGTH) {
    body = stripped;
  } else {
    return null;
  }

  for (const ch of body) {
    if (!CODE_ALPHABET.includes(ch)) return null;
  }
  return format(body);
}

/**
 * A fresh code. Rejection sampling, not modulo: 256 is not a multiple of 30,
 * so `byte % 30` would make the first 16 symbols measurably likelier and
 * quietly cost entropy.
 */
export function generateCode(): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length; // 240
  let body = "";
  while (body.length < BODY_LENGTH) {
    for (const byte of randomBytes(BODY_LENGTH)) {
      if (byte >= limit) continue;
      body += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (body.length === BODY_LENGTH) break;
    }
  }
  return format(body);
}

/**
 * What the customer owes, in cents.
 *
 * `freeCodeCount` must be the number of free-ticket codes the checkout claim
 * ACTUALLY returned — never a count from the request body. The min() and the
 * max() are defence in depth: checkout rejects an over-supply of codes before
 * reaching here, and a negative total would become a refund request to Mollie.
 */
export function computeOrderTotalCents(args: {
  seatCount: number;
  priceCents: number;
  freeCodeCount: number;
}): number {
  const gross = args.priceCents * args.seatCount;
  const discount = args.priceCents * Math.min(args.freeCodeCount, args.seatCount);
  return Math.max(0, gross - discount);
}

/** A code's state is derived from its order, never stored, so it cannot drift. */
export function codeState(row: {
  revoked_at: string | null;
  used_by_order_id: string | null;
  order_status: string | null;
}): CodeState {
  if (row.revoked_at) return "revoked";
  if (!row.used_by_order_id) return "unused";
  return row.order_status === "paid" ? "used" : "in_use";
}
