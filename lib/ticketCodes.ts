/**
 * Pure helpers for access and free-ticket codes, shared by the browser and the
 * API routes. Kept out of `lib/server/` deliberately — the seat page needs to
 * normalise input before sending it, and `lib/server/*` pulls in the Neon
 * driver.
 */

export type CodeKind = "wheelchair" | "free_ticket";
export type CodeState = "unused" | "in_use" | "used" | "revoked";

/**
 * Codes a single order may claim. Lives here, not in `lib/server/`, because
 * the seat-page hook enforces this same cap client-side before ever calling
 * the server, and `lib/server/*` pulls in the Neon driver a client module
 * cannot import. `lib/server/ticketCodes.ts` re-exports this so its existing
 * callers are unaffected.
 */
export const MAX_CODES_PER_ORDER = 10;

/**
 * 30 symbols. I, L, O, U, 0 and 1 are omitted so a code read off a screen or a
 * printed slip cannot be mistyped into a different valid code. 10 characters
 * of this gives about 49 bits — the entropy is what actually protects these,
 * since they are stored in plaintext so the admin can read them back.
 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Exported so `lib/server/ticketCodes.ts`'s `generateCode` can build a code
 *  of the same shape `normalizeCode` accepts, without duplicating either
 *  constant. */
export const BODY_LENGTH = 10;
const PREFIX = "GP";

/** Exported for the same reason as `BODY_LENGTH` — see above. */
export function format(body: string): string {
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
