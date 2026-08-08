import type { NeonQueryFunction } from "@neondatabase/serverless";
import { normalizeCode, type CodeKind } from "@/lib/ticketCodes";

type Sql = NeonQueryFunction<false, false>;

export const MAX_CODES_PER_ORDER = 10;

export type CodeListResult =
  | { ok: true; codes: string[] }
  | { ok: false; error: string };

/**
 * Validate and canonicalise the `codes` field of a checkout request.
 *
 * Deduplication happens AFTER normalising, deliberately: `gp-x8k4m-9rt2p` and
 * `GP X8K4M 9RT2P` are the same code, and counting them twice would let one
 * code discount two tickets.
 */
export function normalizeCodeList(value: unknown): CodeListResult {
  if (value === undefined || value === null) return { ok: true, codes: [] };
  if (!Array.isArray(value)) return { ok: false, error: "Ongeldige codes." };

  const normalized: string[] = [];
  for (const entry of value) {
    const code = normalizeCode(entry);
    if (!code) return { ok: false, error: "Deze code is niet geldig." };
    if (!normalized.includes(code)) normalized.push(code);
  }

  if (normalized.length > MAX_CODES_PER_ORDER)
    return { ok: false, error: `Je kan hoogstens ${MAX_CODES_PER_ORDER} codes gebruiken.` };

  return { ok: true, codes: normalized };
}

/**
 * Bind codes to an order, one statement.
 *
 * The returned rows are the authority on what was actually claimed — the
 * caller must compare their count against what it asked for, and must count
 * the discount from these rows rather than from the request. Anything already
 * spent, revoked, or belonging to another event simply does not come back.
 */
export async function claimCodes(
  sql: Sql,
  orderId: string,
  eventUuid: string,
  codes: string[],
): Promise<{ code: string; kind: CodeKind }[]> {
  if (codes.length === 0) return [];

  const claimed = await sql`
    UPDATE ticket_codes SET used_by_order_id = ${orderId}, used_at = now()
     WHERE code = ANY(${codes})
       AND event_uuid = ${eventUuid}
       AND used_by_order_id IS NULL
       AND revoked_at IS NULL
    RETURNING code, kind;
  `;
  return claimed as unknown as { code: string; kind: CodeKind }[];
}

/**
 * Return an order's codes to the pool. Called from every path that kills a
 * pending order: checkout compensation, the Mollie expired/canceled/failed
 * branch, and the resume flow's expiry.
 *
 * The NOT EXISTS guard is the safety net: a misplaced future call must never
 * un-spend a code on an order that was actually paid.
 */
export async function releaseCodesForOrder(sql: Sql, orderId: string): Promise<number> {
  const released = await sql`
    UPDATE ticket_codes SET used_by_order_id = NULL, used_at = NULL
     WHERE used_by_order_id = ${orderId}
       AND NOT EXISTS (SELECT 1 FROM orders WHERE id = ${orderId} AND status = 'paid')
    RETURNING id;
  `;
  return released.length;
}
