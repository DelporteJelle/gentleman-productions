import { randomBytes } from "crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  normalizeCode,
  codeState,
  CODE_ALPHABET,
  BODY_LENGTH,
  format,
  MAX_CODES_PER_ORDER,
  type CodeKind,
  type CodeState,
} from "@/lib/ticketCodes";

type Sql = NeonQueryFunction<false, false>;

export { MAX_CODES_PER_ORDER };

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

export const MAX_BATCH = 50;
const MAX_LABEL_LENGTH = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GenerateInput {
  eventUuid: string;
  kind: CodeKind;
  label: string;
  quantity: number;
}

export type GenerateValidation =
  | { ok: true; value: GenerateInput }
  | { ok: false; error: string };

export function validateGenerateInput(body: unknown): GenerateValidation {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };
  const b = body as Record<string, unknown>;

  const eventUuid = typeof b.eventUuid === "string" ? b.eventUuid.trim() : "";
  if (!UUID_RE.test(eventUuid)) return { ok: false, error: "Invalid event." };

  const kind = b.kind;
  if (kind !== "wheelchair" && kind !== "free_ticket")
    return { ok: false, error: "Ongeldig codetype." };

  const label = typeof b.label === "string" ? b.label.trim() : "";
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH)
    return { ok: false, error: "Geef een omschrijving voor deze code." };

  // One wheelchair code unlocks one place, so a batch of them is meaningless.
  const requested = kind === "wheelchair" ? 1 : b.quantity;
  if (typeof requested !== "number" || !Number.isInteger(requested) || requested < 1 || requested > MAX_BATCH)
    return { ok: false, error: `Kies een aantal tussen 1 en ${MAX_BATCH}.` };

  return { ok: true, value: { eventUuid, kind, label, quantity: requested } };
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

export async function generateCodes(
  sql: Sql,
  input: GenerateInput,
  createdBy: string | null,
): Promise<{ id: string; code: string }[]> {
  const out: { id: string; code: string }[] = [];
  for (let i = 0; i < input.quantity; i++) {
    // `code` is UNIQUE. A collision at 49 bits is vanishingly unlikely, but
    // ON CONFLICT DO NOTHING plus a retry costs nothing and turns the
    // impossible case into a retry instead of a 500.
    let inserted: { id: string }[] = [];
    let code = "";
    for (let attempt = 0; attempt < 5 && inserted.length === 0; attempt++) {
      code = generateCode();
      inserted = (await sql`
        INSERT INTO ticket_codes (code, kind, label, event_uuid, created_by)
        VALUES (${code}, ${input.kind}, ${input.label}, ${input.eventUuid}, ${createdBy})
        ON CONFLICT (code) DO NOTHING
        RETURNING id;
      `) as unknown as { id: string }[];
    }
    if (inserted.length === 0) throw new Error("Could not generate a unique code");
    out.push({ id: inserted[0].id, code });
  }
  return out;
}

export interface CodeRow {
  id: string;
  code: string;
  kind: CodeKind;
  label: string;
  event_uuid: string;
  created_at: string;
  state: CodeState;
  order_id: string | null;
}

export async function listCodes(sql: Sql): Promise<CodeRow[]> {
  const rows = await sql`
    SELECT c.id, c.code, c.kind, c.label, c.event_uuid, c.created_at,
           c.revoked_at, c.used_by_order_id, o.status AS order_status
      FROM ticket_codes c
      LEFT JOIN orders o ON o.id = c.used_by_order_id
     ORDER BY c.created_at DESC
     LIMIT 500;
  `;
  return (rows as unknown as (Omit<CodeRow, "state" | "order_id"> & {
    revoked_at: string | null;
    used_by_order_id: string | null;
    order_status: string | null;
  })[]).map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind,
    label: r.label,
    event_uuid: r.event_uuid,
    created_at: r.created_at,
    state: codeState(r),
    order_id: r.used_by_order_id,
  }));
}

/** False when the code does not exist, is already spent, or is already revoked. */
export async function revokeCode(sql: Sql, id: string): Promise<boolean> {
  const revoked = await sql`
    UPDATE ticket_codes SET revoked_at = now()
     WHERE id = ${id} AND used_by_order_id IS NULL AND revoked_at IS NULL
    RETURNING id;
  `;
  return revoked.length > 0;
}
