# Access Codes and Free-Ticket Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin hand out single-use codes that unlock a wheelchair place or discount a ticket, verified and priced entirely server-side.

**Architecture:** A new `ticket_codes` table holds event-scoped, single-use, revocable codes. A public endpoint validates a code advisorily so the seat map can unlock a place; it grants nothing. `POST /api/tickets/checkout` is the sole authority: it claims the codes with one conditional `UPDATE … RETURNING` and computes the discount from the rows that statement actually returned. A total of €0 skips Mollie and fulfils through a `fulfilPaidOrder` extracted from `applyMolliePaymentToOrder`, so exactly one code path issues a ticket.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.7, Neon serverless Postgres (HTTP driver — **no interactive transactions**), Vitest 3, CSS Modules. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-08-access-codes-design.md`
**Builds on:** `docs/superpowers/specs/2026-08-07-wheelchair-places-design.md` (shipped)

## Global Constraints

- **No new npm dependencies.**
- **The Neon HTTP driver has no interactive transactions.** Every multi-row mutation is a single `UPDATE … WHERE … RETURNING`; the returned row count is the authority. Compensation blocks, never rollbacks.
- **Nothing the client sends may influence money.** Price comes from `events.dates[]`; the discount is counted from the code-claim's `RETURNING`, never from the request body.
- **Tests:** `npm test` (`vitest run`). Single file: `npx vitest run <path>`.
- **Fake-SQL harnesses must assert on the SQL text.** They model conditions rather than executing them, so a test that only checks the fake's own logic passes whatever the real statement says. Every claim/release test asserts its guards appear in the query. (Learned the hard way in spec 1 — see `lib/server/adminReservation.test.ts`.)
- **Code format:** `GP-XXXXX-XXXXX`. Alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ` — 30 symbols, ambiguous glyphs `I L O U 0 1` removed. ~49 bits.
- **`MAX_CODES_PER_ORDER = 10`.** Free-ticket batches 1–50; wheelchair batches always 1.
- **Dutch user-facing copy, verbatim:**
  - Seat-page notice: `wil je een rolstoel plaats reserveren, mail naar gentlemanproductions.official@gmail.com, heb je een code gekregen, geef deze onderaan de pagina in.`
  - Apply button: `Toepassen`
  - Code input placeholder: `GP-XXXXX-XXXXX`
  - Invalid: `Deze code is niet geldig.`
  - Already used: `Deze code is al gebruikt.`
  - Already applied: `Deze code is al toegevoegd.`
  - Too many: `Je kan hoogstens 10 codes gebruiken.`
  - Claim conflict at checkout: `Eén of meer codes zijn niet (meer) geldig.`
  - Two wheelchair codes: `Je kan maar één rolstoelcode per bestelling gebruiken.`
  - Wheelchair code without a place: `Je hebt een rolstoelcode ingegeven maar geen rolstoelplaats gekozen.`
  - Wheelchair place without a code: `Voor een rolstoelplaats heb je een code nodig.`
  - Too many free codes: `Je hebt meer gratis-codes dan tickets.`
  - Free-ticket checkout button: `Bevestig gratis tickets`
- **Nil uuid sentinel:** `00000000-0000-0000-0000-000000000000`, used where "no wheelchair ticket unlocked" must compare as false rather than SQL `NULL`.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/ticketCodes.ts` | Pure, client-safe: normalise/format/generate a code, discount arithmetic, derived code state |
| `lib/server/ticketCodes.ts` | DB: claim, release, generate batch, list, revoke; input validation |
| `lib/codeStore.ts` | sessionStorage handoff from seat page to checkout page |
| `components/TicketCodes/useTicketCodes.ts` | Hook owning applied-code state and validation calls |
| `components/TicketCodes/CodeEntryPanel.tsx` | Public code input + applied chips |
| `components/TicketCodes/AdminCodeGenerator.tsx` | Admin generate form + generated list |
| `components/TicketCodes/TicketCodes.module.css` | Styles for both |
| `app/api/tickets/codes/validate/route.ts` | Public, rate-limited advisory check |
| `app/api/tickets/admin/codes/route.ts` | ADMIN generate (POST) + list (GET) |
| `app/api/tickets/admin/codes/[id]/revoke/route.ts` | ADMIN revoke |

Existing files modified: `scripts/ticketing-schema.sql`, `lib/server/checkoutValidation.ts`, `app/api/tickets/checkout/route.ts`, `lib/server/orderFulfillment.ts`, `lib/server/orderResume.ts`, `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`, `app/event/[id]/ticket/[dateId]/checkout/page.tsx`, `app/private/admin-portal/page.tsx`.

---

### Task 1: Schema and the pure code module

**Files:**
- Modify: `scripts/ticketing-schema.sql` (append)
- Create: `lib/ticketCodes.ts`
- Test: `lib/ticketCodes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CodeKind = "wheelchair" | "free_ticket"`
  - `type CodeState = "unused" | "in_use" | "used" | "revoked"`
  - `CODE_ALPHABET: string`
  - `normalizeCode(value: unknown): string | null`
  - `generateCode(): string`
  - `computeOrderTotalCents(args: { seatCount: number; priceCents: number; freeCodeCount: number }): number`
  - `codeState(row: { revoked_at: string | null; used_by_order_id: string | null; order_status: string | null }): CodeState`

- [ ] **Step 1: Write the failing tests**

Create `lib/ticketCodes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET,
  normalizeCode,
  generateCode,
  computeOrderTotalCents,
  codeState,
} from "@/lib/ticketCodes";

describe("CODE_ALPHABET", () => {
  it("has 30 symbols and excludes the ambiguous glyphs", () => {
    expect(CODE_ALPHABET).toHaveLength(30);
    for (const bad of ["I", "L", "O", "U", "0", "1"]) {
      expect(CODE_ALPHABET).not.toContain(bad);
    }
  });
  it("has no duplicates", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });
});

describe("normalizeCode", () => {
  it("accepts the canonical form unchanged", () => {
    expect(normalizeCode("GP-X8K4M-9RT2P")).toBe("GP-X8K4M-9RT2P");
  });

  it("uppercases and strips punctuation and spaces", () => {
    expect(normalizeCode("  gp x8k4m 9rt2p ")).toBe("GP-X8K4M-9RT2P");
    expect(normalizeCode("gp.x8k4m.9rt2p")).toBe("GP-X8K4M-9RT2P");
  });

  it("accepts a bare body without the prefix", () => {
    expect(normalizeCode("X8K4M9RT2P")).toBe("GP-X8K4M-9RT2P");
  });

  it("rejects a body containing an ambiguous glyph", () => {
    // O and 0 are excluded, so a code can never contain one — refusing here
    // means a typo fails fast instead of hitting the database.
    expect(normalizeCode("GP-X8K4M-9RT2O")).toBeNull();
    expect(normalizeCode("GP-X8K4M-9RT20")).toBeNull();
  });

  it("rejects wrong lengths", () => {
    expect(normalizeCode("GP-X8K4M-9RT2")).toBeNull();
    expect(normalizeCode("GP-X8K4M-9RT2PQ")).toBeNull();
    expect(normalizeCode("")).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
    expect(normalizeCode(42)).toBeNull();
    expect(normalizeCode({})).toBeNull();
  });

  it("is idempotent", () => {
    const once = normalizeCode("gp x8k4m 9rt2p")!;
    expect(normalizeCode(once)).toBe(once);
  });
});

describe("generateCode", () => {
  it("produces a code that normalizes to itself", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(normalizeCode(code)).toBe(code);
    }
  });

  it("uses only alphabet symbols", () => {
    for (let i = 0; i < 50; i++) {
      const body = generateCode().replace(/^GP-/, "").replace("-", "");
      for (const ch of body) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("does not repeat itself across many draws", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(seen.size).toBe(200);
  });
});

describe("computeOrderTotalCents", () => {
  it("charges every seat when there are no free codes", () => {
    expect(computeOrderTotalCents({ seatCount: 3, priceCents: 1500, freeCodeCount: 0 })).toBe(4500);
  });

  it("discounts one ticket price per free code", () => {
    expect(computeOrderTotalCents({ seatCount: 3, priceCents: 1500, freeCodeCount: 1 })).toBe(3000);
    expect(computeOrderTotalCents({ seatCount: 3, priceCents: 1500, freeCodeCount: 2 })).toBe(1500);
  });

  it("reaches exactly zero when every seat is covered", () => {
    expect(computeOrderTotalCents({ seatCount: 2, priceCents: 1500, freeCodeCount: 2 })).toBe(0);
  });

  it("never goes negative even if more codes than seats slip through", () => {
    // Checkout rejects this earlier; the clamp is defence in depth, because a
    // negative total would be a refund request to Mollie.
    expect(computeOrderTotalCents({ seatCount: 1, priceCents: 1500, freeCodeCount: 5 })).toBe(0);
  });

  it("handles a free date", () => {
    expect(computeOrderTotalCents({ seatCount: 2, priceCents: 0, freeCodeCount: 0 })).toBe(0);
  });
});

describe("codeState", () => {
  it("reports an unclaimed code as unused", () => {
    expect(codeState({ revoked_at: null, used_by_order_id: null, order_status: null })).toBe("unused");
  });

  it("reports a code on a pending order as in use", () => {
    expect(codeState({ revoked_at: null, used_by_order_id: "o1", order_status: "pending" })).toBe("in_use");
  });

  it("reports a code on a paid order as used", () => {
    expect(codeState({ revoked_at: null, used_by_order_id: "o1", order_status: "paid" })).toBe("used");
  });

  it("reports a code on a cancelled order as in use", () => {
    // Release should already have cleared it; if it hasn't, "in use" is the
    // honest answer and revoke still refuses to touch it.
    expect(codeState({ revoked_at: null, used_by_order_id: "o1", order_status: "cancelled" })).toBe("in_use");
  });

  it("reports revocation ahead of everything else", () => {
    expect(codeState({ revoked_at: "2026-08-08T10:00:00Z", used_by_order_id: null, order_status: null })).toBe("revoked");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/ticketCodes.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ticketCodes'`

- [ ] **Step 3: Write the implementation**

Create `lib/ticketCodes.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/ticketCodes.test.ts`
Expected: PASS (20 tests)

- [ ] **Step 5: Append the schema**

Append to `scripts/ticketing-schema.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Access codes and free-ticket codes.
-- See docs/superpowers/specs/2026-08-08-access-codes-design.md
--
-- Single-use, event-scoped, revocable. State is DERIVED, not stored: a code is
-- unused while used_by_order_id is null, in use while that order is pending,
-- and used once it is paid — so nothing can drift out of sync with the order.
--
-- Stored in plaintext on purpose: the admin has to read codes back in the
-- portal to hand them out. ~49 bits of entropy is the protection.
-- ---------------------------------------------------------------------------
create table if not exists ticket_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  kind             text not null check (kind in ('wheelchair','free_ticket')),
  label            text not null,
  event_uuid       text not null,
  created_at       timestamptz not null default now(),
  created_by       text,
  revoked_at       timestamptz,
  used_by_order_id uuid references orders(id) on delete set null,
  used_at          timestamptz
);
create index if not exists ticket_codes_event_idx on ticket_codes(event_uuid);
create index if not exists ticket_codes_order_idx on ticket_codes(used_by_order_id);
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ticketing-schema.sql lib/ticketCodes.ts lib/ticketCodes.test.ts
git commit -m "feat: add ticket_codes table and pure code helpers"
```

---

### Task 2: Server module — claim and release

The two operations checkout depends on.

**Files:**
- Create: `lib/server/ticketCodes.ts`
- Test: `lib/server/ticketCodes.test.ts`

**Interfaces:**
- Consumes: `normalizeCode`, `CodeKind` from `lib/ticketCodes.ts`.
- Produces:
  - `MAX_CODES_PER_ORDER = 10`
  - `normalizeCodeList(value: unknown): { ok: true; codes: string[] } | { ok: false; error: string }`
  - `claimCodes(sql, orderId: string, eventUuid: string, codes: string[]): Promise<{ code: string; kind: CodeKind }[]>`
  - `releaseCodesForOrder(sql, orderId: string): Promise<number>`

- [ ] **Step 1: Write the failing tests**

Create `lib/server/ticketCodes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_CODES_PER_ORDER,
  normalizeCodeList,
  claimCodes,
  releaseCodesForOrder,
} from "@/lib/server/ticketCodes";
import { generateCode } from "@/lib/ticketCodes";

describe("normalizeCodeList", () => {
  it("accepts an absent list as empty", () => {
    expect(normalizeCodeList(undefined)).toEqual({ ok: true, codes: [] });
    expect(normalizeCodeList(null)).toEqual({ ok: true, codes: [] });
  });

  it("normalizes and keeps order", () => {
    const result = normalizeCodeList(["gp x8k4m 9rt2p", "GP-A2B3C-D4E5F"]);
    expect(result).toEqual({ ok: true, codes: ["GP-X8K4M-9RT2P", "GP-A2B3C-D4E5F"] });
  });

  it("deduplicates AFTER normalising", () => {
    // The same code typed two different ways must count once, or a single
    // code could be made to discount twice.
    const result = normalizeCodeList(["gp-x8k4m-9rt2p", "GP X8K4M 9RT2P"]);
    expect(result).toEqual({ ok: true, codes: ["GP-X8K4M-9RT2P"] });
  });

  it("rejects a non-array", () => {
    expect(normalizeCodeList("GP-X8K4M-9RT2P").ok).toBe(false);
  });

  it("rejects a malformed entry", () => {
    expect(normalizeCodeList(["not-a-code"]).ok).toBe(false);
  });

  it(`rejects more than ${MAX_CODES_PER_ORDER} codes`, () => {
    const tooMany = Array.from({ length: MAX_CODES_PER_ORDER + 1 }, () => generateCode());
    expect(normalizeCodeList(tooMany).ok).toBe(false);
  });

  it(`accepts exactly ${MAX_CODES_PER_ORDER} codes`, () => {
    const exact = Array.from({ length: MAX_CODES_PER_ORDER }, () => generateCode());
    expect(normalizeCodeList(exact).ok).toBe(true);
  });
});

// ============================================================================
// claimCodes / releaseCodesForOrder — driven by a fake `sql`, no database.
// Same approach as lib/server/wheelchairPlaces.test.ts.
// ============================================================================

interface FakeCode {
  code: string; kind: string; event_uuid: string;
  revoked_at: string | null; used_by_order_id: string | null; used_at: string | null;
}

const EVENT = "11111111-1111-4111-8111-111111111111";

function freshCodes(): FakeCode[] {
  return [
    { code: "GP-AAAAA-AAAAA", kind: "free_ticket", event_uuid: EVENT, revoked_at: null, used_by_order_id: null, used_at: null },
    { code: "GP-BBBBB-BBBBB", kind: "free_ticket", event_uuid: EVENT, revoked_at: null, used_by_order_id: null, used_at: null },
    { code: "GP-CCCCC-CCCCC", kind: "wheelchair", event_uuid: EVENT, revoked_at: null, used_by_order_id: null, used_at: null },
  ];
}

function createFakeSql(codes: FakeCode[], orders: { id: string; status: string }[] = []) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim().replace(/\s+/g, " ");
    const full = strings.join(" ");

    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = ") && full.includes("used_at = now()")) {
      // The fake models these conditions rather than running them, so pin the
      // three guards that make single use actually single use.
      expect(full).toContain("used_by_order_id IS NULL");
      expect(full).toContain("revoked_at IS NULL");
      expect(full).toContain("event_uuid =");
      const [orderId, codeList, eventUuid] = values as [string, string[], string];
      const claimed: { code: string; kind: string }[] = [];
      for (const c of codes) {
        if (
          codeList.includes(c.code) &&
          c.event_uuid === eventUuid &&
          c.used_by_order_id === null &&
          c.revoked_at === null
        ) {
          c.used_by_order_id = orderId;
          c.used_at = "now";
          claimed.push({ code: c.code, kind: c.kind });
        }
      }
      return claimed;
    }

    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = NULL")) {
      // Without this guard a stray call could un-spend a code on a paid order.
      expect(full).toContain("NOT EXISTS");
      expect(full).toContain("status = 'paid'");
      const [orderId] = values as [string];
      if (orders.some((o) => o.id === orderId && o.status === "paid")) return [];
      const released: { id: string }[] = [];
      for (const c of codes) {
        if (c.used_by_order_id !== orderId) continue;
        c.used_by_order_id = null;
        c.used_at = null;
        released.push({ id: c.code });
      }
      return released;
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof claimCodes>[0];
}

describe("claimCodes", () => {
  it("claims every requested code and reports its kind", async () => {
    const codes = freshCodes();
    const sql = createFakeSql(codes);

    const claimed = await claimCodes(sql, "order-1", EVENT, ["GP-AAAAA-AAAAA", "GP-CCCCC-CCCCC"]);

    expect(claimed).toHaveLength(2);
    expect(claimed.map((c) => c.kind).sort()).toEqual(["free_ticket", "wheelchair"]);
    expect(codes[0].used_by_order_id).toBe("order-1");
    expect(codes[1].used_by_order_id).toBeNull(); // untouched
  });

  it("returns fewer rows than asked when a code is already spent", async () => {
    const codes = freshCodes();
    codes[0].used_by_order_id = "someone-else";
    const sql = createFakeSql(codes);

    const claimed = await claimCodes(sql, "order-1", EVENT, ["GP-AAAAA-AAAAA", "GP-BBBBB-BBBBB"]);

    expect(claimed).toHaveLength(1);
    expect(claimed[0].code).toBe("GP-BBBBB-BBBBB");
  });

  it("refuses a revoked code", async () => {
    const codes = freshCodes();
    codes[0].revoked_at = "2026-08-08T00:00:00Z";
    const sql = createFakeSql(codes);

    expect(await claimCodes(sql, "order-1", EVENT, ["GP-AAAAA-AAAAA"])).toEqual([]);
  });

  it("refuses a code belonging to a different event", async () => {
    // A code for a cheap show must not be spendable on an expensive one.
    const codes = freshCodes();
    const sql = createFakeSql(codes);

    const other = "22222222-2222-4222-8222-222222222222";
    expect(await claimCodes(sql, "order-1", other, ["GP-AAAAA-AAAAA"])).toEqual([]);
  });

  it("does not touch the database for an empty list", async () => {
    const sql = (() => { throw new Error("should not query"); }) as unknown as Parameters<typeof claimCodes>[0];
    expect(await claimCodes(sql, "order-1", EVENT, [])).toEqual([]);
  });
});

describe("releaseCodesForOrder", () => {
  it("frees every code the order held", async () => {
    const codes = freshCodes();
    const sql = createFakeSql(codes, [{ id: "order-1", status: "pending" }]);
    await claimCodes(sql, "order-1", EVENT, ["GP-AAAAA-AAAAA", "GP-BBBBB-BBBBB"]);

    const released = await releaseCodesForOrder(sql, "order-1");

    expect(released).toBe(2);
    expect(codes.every((c) => c.used_by_order_id === null)).toBe(true);
    expect(codes.every((c) => c.used_at === null)).toBe(true);
  });

  it("refuses to un-spend codes on a PAID order", async () => {
    const codes = freshCodes();
    const orders = [{ id: "order-1", status: "pending" }];
    const sql = createFakeSql(codes, orders);
    await claimCodes(sql, "order-1", EVENT, ["GP-AAAAA-AAAAA"]);
    orders[0].status = "paid";

    expect(await releaseCodesForOrder(sql, "order-1")).toBe(0);
    expect(codes[0].used_by_order_id).toBe("order-1");
  });

  it("is a no-op for an order holding nothing", async () => {
    const sql = createFakeSql(freshCodes());
    expect(await releaseCodesForOrder(sql, "order-none")).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/server/ticketCodes.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/ticketCodes'`

- [ ] **Step 3: Write the implementation**

Create `lib/server/ticketCodes.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/server/ticketCodes.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/server/ticketCodes.ts lib/server/ticketCodes.test.ts
git commit -m "feat: add atomic code claim and release"
```

---

### Task 3: Extract fulfilPaidOrder

A pure refactor with no behaviour change, done before checkout needs it so the diff that adds the €0 path stays small. The existing tests must pass untouched.

**Files:**
- Modify: `lib/server/orderFulfillment.ts:52-135`
- Test: `lib/server/orderFulfillment.test.ts` (add cases; existing ones unchanged)

**Interfaces:**
- Consumes: nothing new.
- Produces: `fulfilPaidOrder(sql, orderId: string): Promise<"paid" | "ignored">`

- [ ] **Step 1: Extract the function**

In `lib/server/orderFulfillment.ts`, add this export directly above `applyMolliePaymentToOrder`:

```ts
/**
 * Turn a held order into a paid one: sell its tickets, claim the order, email
 * the PDFs.
 *
 * Sell first, claim second. Selling is a harmless 0-row no-op on a retry that
 * already sold these tickets, and if anything below throws, the order is still
 * 'pending' — a retry re-enters and re-runs this UPDATE rather than being
 * short-circuited by an order that is already 'paid' with tickets stuck 'held'
 * forever. The conditional claim, `WHERE status <> 'paid'`, is the exactly-once
 * gate; it guards the email, not the sale.
 *
 * Called by the Mollie path and, for an order whose codes brought it to €0,
 * directly by checkout — so exactly one code path ever issues a ticket.
 */
export async function fulfilPaidOrder(sql: Sql, orderId: string): Promise<"paid" | "ignored"> {
  await sql`
    UPDATE tickets SET status = 'sold', held_until = NULL
    WHERE order_id = ${orderId} AND status = 'held';
  `;

  // Re-read rather than trust the UPDATE's own RETURNING, so a retry that
  // finds 0 rows above (because an earlier call already sold them) still
  // sees the authoritative sold set here.
  const soldTickets = await sql`
    SELECT t.id, s."row" AS row, s.seat_number AS seat_number
    FROM tickets t JOIN seats s ON s.id = t.seat_id
    WHERE t.order_id = ${orderId} AND t.status = 'sold';
  `;

  const claimed = await sql`
    UPDATE orders SET status = 'paid'
    WHERE id = ${orderId} AND status <> 'paid'
    RETURNING *;
  `;
  if (claimed.length === 0) return "ignored";
  const paidOrder = claimed[0] as Order;

  if (soldTickets.length === 0) {
    // Paid but holding no seats — they were taken by a later order, or already
    // released. Sending a ticketless confirmation would make it worse; this
    // needs a human (refund or reseat).
    console.error(
      `Order ${orderId} was paid but claimed no held tickets — seats lost, manual intervention required.`,
    );
    return "paid";
  }

  const events = await sql`SELECT * FROM events WHERE uuid = ${paidOrder.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = event?.dates?.find((d) => d.uuid === paidOrder.date_uuid);

  try {
    const { sendTicketEmail } = await import("@/lib/sendTicketEmail");
    await sendTicketEmail({
      order: paidOrder,
      eventName: event?.title ?? "Show",
      startTime: date?.start_time ?? null,
      location: event?.eventlocation?.location || event?.eventlocation?.city || null,
      productionTheme: event?.production_theme ?? null,
      seats: soldTickets.map((t) => ({
        ticketId: t.id,
        row: t.row,
        seat_number: t.seat_number,
      })),
    });
  } catch (emailErr) {
    console.error(`Email send failed for order ${orderId}:`, emailErr);
  }

  return "paid";
}
```

- [ ] **Step 2: Delegate from applyMolliePaymentToOrder**

Replace the whole `if (payment.status === "paid") { … }` block (its body from the amount check through `return "paid";`) with:

```ts
  if (payment.status === "paid") {
    if (!paymentAmountMatchesOrder(payment.amount.value, order.total_amount)) {
      console.error(
        `Amount mismatch on order ${orderId}: paid ${payment.amount.value}, expected ${order.total_amount} cents`,
      );
      return "ignored";
    }
    return fulfilPaidOrder(sql, orderId);
  }
```

Delete nothing else. `paymentAmountMatchesOrder`, the payment/order mismatch guard and the expired/canceled/failed branch all stay exactly as they are.

- [ ] **Step 3: Run the existing tests unchanged**

Run: `npx vitest run lib/server/orderFulfillment.test.ts`
Expected: PASS with no test edits. This is the whole point of doing the extraction as its own task — if any existing case fails, the extraction changed behaviour and must be fixed before moving on.

- [ ] **Step 4: Add a direct test for the new entry point**

Append to `lib/server/orderFulfillment.test.ts`, inside the existing top-level `describe` if there is one, otherwise at the end of the file:

```ts
describe("fulfilPaidOrder", () => {
  it("sells held tickets and marks the order paid without touching Mollie", async () => {
    const state = freshState();
    state.orders[0].status = "pending";
    state.tickets.forEach((t) => { t.status = "held"; t.order_id = state.orders[0].id; });
    const sql = createFakeSql(state);

    const result = await fulfilPaidOrder(sql, state.orders[0].id);

    expect(result).toBe("paid");
    expect(state.orders[0].status).toBe("paid");
    expect(state.tickets.every((t) => t.status === "sold")).toBe(true);
  });

  it("is idempotent — a second call claims nothing", async () => {
    const state = freshState();
    state.orders[0].status = "pending";
    state.tickets.forEach((t) => { t.status = "held"; t.order_id = state.orders[0].id; });
    const sql = createFakeSql(state);

    await fulfilPaidOrder(sql, state.orders[0].id);
    expect(await fulfilPaidOrder(sql, state.orders[0].id)).toBe("ignored");
  });
});
```

Adapt `freshState`/`createFakeSql` to whatever the existing helpers in that file are named — read the file first and reuse them rather than adding a second harness. Import `fulfilPaidOrder` alongside the existing imports.

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/server/orderFulfillment.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/server/orderFulfillment.ts lib/server/orderFulfillment.test.ts
git commit -m "refactor: extract fulfilPaidOrder from applyMolliePaymentToOrder"
```

---

### Task 4: Checkout integration — the security core

**Files:**
- Modify: `lib/server/checkoutValidation.ts:18-68`
- Modify: `app/api/tickets/checkout/route.ts`
- Modify: `lib/server/orderFulfillment.ts` (expired branch), `lib/server/orderResume.ts` (`expirePendingOrder`)
- Test: `lib/server/checkoutValidation.test.ts`

**Interfaces:**
- Consumes: `claimCodes`, `releaseCodesForOrder`, `normalizeCodeList` (Task 2); `computeOrderTotalCents` (Task 1); `fulfilPaidOrder` (Task 3).
- Produces: `CheckoutInput` gains `codes: string[]`. The route returns `{ checkoutUrl, orderId }` as before, or `{ orderId, free: true }` when the total is 0.

- [ ] **Step 1: Write the failing validation tests**

Append to `lib/server/checkoutValidation.test.ts`:

```ts
describe("validateCheckoutInput — codes", () => {
  const base = {
    eventUuid: "3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f01",
    dateUuid: "date-1",
    ticketIds: ["3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f02"],
    name: "Jan",
    email: "jan@example.com",
  };

  it("defaults to no codes when the field is absent", () => {
    const result = validateCheckoutInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.codes).toEqual([]);
  });

  it("normalizes supplied codes", () => {
    const result = validateCheckoutInput({ ...base, codes: ["gp x8k4m 9rt2p"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.codes).toEqual(["GP-X8K4M-9RT2P"]);
  });

  it("rejects a malformed code", () => {
    expect(validateCheckoutInput({ ...base, codes: ["nope"] }).ok).toBe(false);
  });

  it("collapses the same code supplied twice", () => {
    const result = validateCheckoutInput({ ...base, codes: ["GP-X8K4M-9RT2P", "gp-x8k4m-9rt2p"] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.codes).toEqual(["GP-X8K4M-9RT2P"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/server/checkoutValidation.test.ts`
Expected: FAIL — `codes` is not a property of the validated value.

- [ ] **Step 3: Extend the validator**

In `lib/server/checkoutValidation.ts`, add the import and the field:

```ts
import { normalizeCodeList } from "./ticketCodes";
```

Add `codes: string[];` to `CheckoutInput`, and insert this immediately before the final `return`:

```ts
  const codeList = normalizeCodeList((body as { codes?: unknown }).codes);
  if (!codeList.ok) return { ok: false, error: codeList.error };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds, name, email, codes: codeList.codes } };
```

(replacing the existing `return { ok: true, value: { eventUuid, dateUuid, ticketIds, name, email } };`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/server/checkoutValidation.test.ts`
Expected: PASS

- [ ] **Step 5: Wire codes into the checkout route**

In `app/api/tickets/checkout/route.ts`:

Add imports:

```ts
import { claimCodes, releaseCodesForOrder } from "@/lib/server/ticketCodes";
import { computeOrderTotalCents } from "@/lib/ticketCodes";
import { fulfilPaidOrder } from "@/lib/server/orderFulfillment";
```

Add the sentinel just below the imports:

```ts
/** Compares as false rather than SQL NULL when no wheelchair place is unlocked. */
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
```

Extend `releaseAndDelete` so it frees codes before deleting the order:

```ts
  const releaseAndDelete = async () => {
    await releaseCodesForOrder(sql, orderId!);
    await sql`
      UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
      WHERE order_id = ${orderId};
    `;
    await sql`DELETE FROM orders WHERE id = ${orderId};`;
  };
```

Destructure `codes` from the validated value:

```ts
    const { eventUuid, dateUuid, ticketIds, name, email, codes } = parsed.value;
```

Delete **both** existing lines:

```ts
    const totalCents = eurosToCents(date.price) * ticketIds.length;
    const totalEuros = (totalCents / 100).toFixed(2);
```

and put in their place:

```ts
    const priceCents = eurosToCents(date.price);
    const grossCents = priceCents * ticketIds.length;
```

`totalEuros` moves down to after the discount is known (step below); the INSERT keeps the gross amount, so a request that crashes mid-flight leaves a sane row rather than a €0 one. Change the INSERT's `${totalCents}` to `${grossCents}`.

Then, immediately after `orderId = created[0].id as string;`, insert the code and wheelchair handling:

```ts
    // Codes are claimed BEFORE the seats, because whether a wheelchair place
    // may be claimed at all depends on a wheelchair code having been won here.
    const claimedCodes = await claimCodes(sql, orderId, eventUuid, codes);
    if (claimedCodes.length !== codes.length) {
      await releaseAndDelete();
      return errorResponse("Eén of meer codes zijn niet (meer) geldig.", 409);
    }

    const wheelchairCodes = claimedCodes.filter((c) => c.kind === "wheelchair").length;
    const freeCodes = claimedCodes.filter((c) => c.kind === "free_ticket").length;

    if (wheelchairCodes > 1) {
      await releaseAndDelete();
      return errorResponse("Je kan maar één rolstoelcode per bestelling gebruiken.", 409);
    }
    if (freeCodes > ticketIds.length) {
      await releaseAndDelete();
      return errorResponse("Je hebt meer gratis-codes dan tickets.", 409);
    }

    // What the requested tickets actually ARE, read from the database — never
    // taken on the client's word.
    const requested = await sql`
      SELECT id, seat_kind FROM tickets
       WHERE id = ANY(${ticketIds}) AND event_uuid = ${eventUuid} AND date_uuid = ${dateUuid};
    `;
    const anchors = requested.filter((r) => r.seat_kind === "wheelchair");
    const floors = requested.filter((r) => r.seat_kind === "wheelchair_floor");

    if (floors.length > 0 || anchors.length > 1) {
      await releaseAndDelete();
      return errorResponse("Ongeldige stoelselectie.", 409);
    }
    if (anchors.length === 1 && wheelchairCodes === 0) {
      await releaseAndDelete();
      return errorResponse("Voor een rolstoelplaats heb je een code nodig.", 409);
    }
    if (anchors.length === 0 && wheelchairCodes === 1) {
      // Refuse rather than silently burn a single-use code on nothing.
      await releaseAndDelete();
      return errorResponse("Je hebt een rolstoelcode ingegeven maar geen rolstoelplaats gekozen.", 409);
    }

    const wheelchairTicketId = (anchors[0]?.id as string | undefined) ?? NIL_UUID;
```

In the seat-claim statement, replace the line `AND t.seat_kind IS NULL` with:

```sql
         -- Widened by exactly one term: the single anchor a wheelchair code
         -- unlocked, or the nil uuid (matching nothing) when none did.
         AND (t.seat_kind IS NULL OR t.id = ${wheelchairTicketId})
```

After the `if (claimed.length !== ticketIds.length) { … }` block, compute and store the real total:

```ts
    const totalCents = computeOrderTotalCents({
      seatCount: ticketIds.length,
      priceCents,
      freeCodeCount: freeCodes,
    });
    if (totalCents !== grossCents) {
      await sql`UPDATE orders SET total_amount = ${totalCents} WHERE id = ${orderId};`;
    }

    // Nothing left to pay: no Mollie session exists to settle this order, so
    // fulfil it here through the same function the paid path uses.
    if (totalCents === 0) {
      await fulfilPaidOrder(sql, orderId);
      return jsonResponse({ orderId, free: true });
    }

    const totalEuros = (totalCents / 100).toFixed(2);
```

Delete the old `const totalEuros = …` line near the top. Everything from `const baseUrl = …` onward is unchanged.

- [ ] **Step 6: Release codes on the two other cancel paths**

In `lib/server/orderFulfillment.ts`, add the import:

```ts
import { releaseCodesForOrder } from "./ticketCodes";
```

and in the `expired`/`canceled`/`failed` branch, add the release as the first statement:

```ts
  if (["expired", "canceled", "failed"].includes(payment.status)) {
    await releaseCodesForOrder(sql, orderId);
    await sql`
      UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
      WHERE order_id = ${orderId} AND status = 'held';
    `;
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${orderId} AND status = 'pending';`;
    return "released";
  }
```

In `lib/server/orderResume.ts`, add the same import and put the release immediately before the ticket release inside `expirePendingOrder`:

```ts
  await releaseCodesForOrder(sql, order.id);
  // `AND status = 'held'` bounds the blast radius: a sold ticket carrying this
  // order_id (paid between our read and now) must never be un-sold.
  await sql`
    UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
    WHERE order_id = ${order.id} AND status = 'held';
  `;
```

`resumeOrder` itself needs no change: it already reuses `order.total_amount` verbatim rather than recomputing, so a discount survives a resume.

- [ ] **Step 7: Update the two fake harnesses that now see new queries**

`lib/server/orderFulfillment.test.ts` and `lib/server/orderResume.test.ts` both throw on unrecognised SQL, so the new release call breaks them. Add this branch to each file's fake `sql`, before its final `throw`:

```ts
    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id = NULL")) {
      return []; // no codes in these fixtures
    }
```

Match `head` to however that file computes it — if it does not already collapse whitespace, use `strings[0].trim().replace(/\s+/g, " ")` for this comparison.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. Then `npx tsc --noEmit && npm run build`.

- [ ] **Step 9: Commit**

```bash
git add lib/server/checkoutValidation.ts lib/server/checkoutValidation.test.ts app/api/tickets/checkout/route.ts lib/server/orderFulfillment.ts lib/server/orderFulfillment.test.ts lib/server/orderResume.ts lib/server/orderResume.test.ts
git commit -m "feat: claim codes at checkout, price the discount server-side"
```

---

### Task 5: Admin code routes

**Files:**
- Modify: `lib/server/ticketCodes.ts` (append)
- Create: `app/api/tickets/admin/codes/route.ts`
- Create: `app/api/tickets/admin/codes/[id]/revoke/route.ts`
- Test: `lib/server/ticketCodes.test.ts` (append)

**Interfaces:**
- Consumes: `generateCode`, `codeState` (Task 1).
- Produces:
  - `MAX_BATCH = 50`
  - `validateGenerateInput(body): { ok: true; value: { eventUuid: string; kind: CodeKind; label: string; quantity: number } } | { ok: false; error: string }`
  - `generateCodes(sql, input, createdBy: string | null): Promise<{ code: string; id: string }[]>`
  - `listCodes(sql): Promise<CodeRow[]>` where `CodeRow = { id, code, kind, label, event_uuid, created_at, state, order_id }`
  - `revokeCode(sql, id: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Append to `lib/server/ticketCodes.test.ts`:

```ts
import { validateGenerateInput, MAX_BATCH } from "@/lib/server/ticketCodes";

describe("validateGenerateInput", () => {
  const base = { eventUuid: EVENT, kind: "free_ticket", label: "winactie radio 2", quantity: 3 };

  it("accepts a well-formed free-ticket batch", () => {
    const result = validateGenerateInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quantity).toBe(3);
  });

  it("forces a wheelchair batch to a single code", () => {
    // One wheelchair code unlocks one place; a batch of them would be
    // meaningless and easy to over-hand-out by accident.
    const result = validateGenerateInput({ ...base, kind: "wheelchair", quantity: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.quantity).toBe(1);
  });

  it("rejects an unknown kind", () => {
    expect(validateGenerateInput({ ...base, kind: "discount" }).ok).toBe(false);
  });

  it("rejects a missing label", () => {
    // The label is how the admin knows who they gave it to; without it the
    // portal list is unusable.
    expect(validateGenerateInput({ ...base, label: "   " }).ok).toBe(false);
  });

  it("rejects a non-uuid eventUuid", () => {
    expect(validateGenerateInput({ ...base, eventUuid: "nope" }).ok).toBe(false);
  });

  it("rejects a quantity below 1 or above the batch cap", () => {
    expect(validateGenerateInput({ ...base, quantity: 0 }).ok).toBe(false);
    expect(validateGenerateInput({ ...base, quantity: MAX_BATCH + 1 }).ok).toBe(false);
    expect(validateGenerateInput({ ...base, quantity: 1.5 }).ok).toBe(false);
  });

  it("accepts exactly the batch cap", () => {
    expect(validateGenerateInput({ ...base, quantity: MAX_BATCH }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/server/ticketCodes.test.ts`
Expected: FAIL — `validateGenerateInput` is not exported.

- [ ] **Step 3: Add the server functions**

First **extend the existing import at the top of the file** rather than adding a second one — `no-duplicate-imports` will reject two `from "@/lib/ticketCodes"` lines:

```ts
import { normalizeCode, generateCode, codeState, type CodeKind, type CodeState } from "@/lib/ticketCodes";
```

Then append to `lib/server/ticketCodes.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/server/ticketCodes.test.ts`
Expected: PASS

- [ ] **Step 5: Write the routes**

Create `app/api/tickets/admin/codes/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole, parseBody, verifyAuth } from "@/lib/server/api";
import { validateGenerateInput, generateCodes, listCodes } from "@/lib/server/ticketCodes";

export async function GET(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    return jsonResponse({ codes: await listCodes(getDb()) });
  } catch (err) {
    console.error("Listing ticket codes failed:", err);
    return errorResponse("Kon de codes niet laden.", 500);
  }
}

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateGenerateInput(await parseBody<unknown>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const user = verifyAuth(request);
    const created = await generateCodes(getDb(), parsed.value, user?.username ?? null);
    return jsonResponse({ codes: created });
  } catch (err) {
    console.error("Generating ticket codes failed:", err);
    return errorResponse("Kon de codes niet aanmaken. Probeer opnieuw.", 500);
  }
}
```

Create `app/api/tickets/admin/codes/[id]/revoke/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { revokeCode } from "@/lib/server/ticketCodes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Code niet gevonden", 404);

  try {
    const revoked = await revokeCode(getDb(), id);
    if (!revoked) return errorResponse("Deze code is al gebruikt of al ingetrokken.", 409);
    return jsonResponse({ revoked: true });
  } catch (err) {
    console.error(`Revoking code ${id} failed:`, err);
    return errorResponse("Kon de code niet intrekken. Probeer opnieuw.", 500);
  }
}
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, with `/api/tickets/admin/codes` and `/api/tickets/admin/codes/[id]/revoke` in the route list.

- [ ] **Step 7: Commit**

```bash
git add lib/server/ticketCodes.ts lib/server/ticketCodes.test.ts "app/api/tickets/admin/codes"
git commit -m "feat: add admin code generation, listing and revocation"
```

---

### Task 6: Public validate route

**Files:**
- Create: `app/api/tickets/codes/validate/route.ts`

**Interfaces:**
- Consumes: `normalizeCode` (Task 1); `checkRateLimit`, `getClientIp` from `lib/rateLimit.ts`.
- Produces: `POST /api/tickets/codes/validate` → `200 { kind }` or 404/429.

- [ ] **Step 1: Write the route**

Create `app/api/tickets/codes/validate/route.ts`:

```ts
import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { normalizeCode } from "@/lib/ticketCodes";
import { isUuid } from "@/lib/server/checkoutValidation";

/**
 * Advisory only. This endpoint GRANTS NOTHING and CONSUMES NOTHING — it exists
 * so the seat map can unlock a wheelchair place and show the discount before
 * the customer commits. `POST /api/tickets/checkout` re-reads and claims the
 * codes itself, and is the sole authority on both.
 */
export async function POST(request: Request) {
  const rate = checkRateLimit(`codes:${getClientIp(request)}`, 20, 15 * 60 * 1000);
  if (!rate.allowed) {
    return errorResponse("Te veel pogingen. Probeer het later opnieuw.", 429);
  }

  try {
    const body = await parseBody<{ eventUuid?: unknown; code?: unknown }>(request);

    const eventUuid = typeof body?.eventUuid === "string" ? body.eventUuid.trim() : "";
    if (!isUuid(eventUuid)) return errorResponse("Deze code is niet geldig.", 404);

    const code = normalizeCode(body?.code);
    if (!code) return errorResponse("Deze code is niet geldig.", 404);

    const sql = getDb();
    const rows = await sql`
      SELECT kind, revoked_at, used_by_order_id
        FROM ticket_codes
       WHERE code = ${code} AND event_uuid = ${eventUuid};
    `;
    const found = rows[0] as
      | { kind: string; revoked_at: string | null; used_by_order_id: string | null }
      | undefined;

    if (!found || found.revoked_at) return errorResponse("Deze code is niet geldig.", 404);
    // Distinguished on purpose: a brute-forcer learns nothing here they could
    // not learn by trying the code at checkout, and someone who mistyped
    // deserves to know which problem they have.
    if (found.used_by_order_id) return errorResponse("Deze code is al gebruikt.", 409);

    return jsonResponse({ kind: found.kind });
  } catch (err) {
    console.error("Code validation failed:", err);
    return errorResponse("Kon de code niet controleren. Probeer opnieuw.", 500);
  }
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, with `/api/tickets/codes/validate` in the route list.

- [ ] **Step 3: Commit**

```bash
git add "app/api/tickets/codes/validate"
git commit -m "feat: add rate-limited advisory code validation endpoint"
```

---

### Task 7: Code store and the applied-codes hook

**Files:**
- Create: `lib/codeStore.ts`
- Test: `lib/codeStore.test.ts`
- Create: `components/TicketCodes/useTicketCodes.ts`

**Interfaces:**
- Consumes: `CodeKind`, `normalizeCode` (Task 1); `POST /api/tickets/codes/validate` (Task 6).
- Produces:
  - `interface AppliedCode { code: string; kind: CodeKind }`
  - `readCodes(storage: Storage | undefined, dateUuid: string): AppliedCode[]`
  - `writeCodes(storage: Storage | undefined, dateUuid: string, codes: AppliedCode[]): void`
  - `clearCodes(storage: Storage | undefined, dateUuid: string): void`
  - `useTicketCodes(eventUuid: string | undefined, dateUuid: string)` returning `{ applied, error, busy, apply, remove, clear, wheelchairCount, freeCount }`

- [ ] **Step 1: Write the failing tests**

Create `lib/codeStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { readCodes, writeCodes, clearCodes, CODE_STORE_KEY } from "@/lib/codeStore";

/** Minimal in-memory Storage, same approach as lib/orderStore.test.ts. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

const wc = { code: "GP-AAAAA-AAAAA", kind: "wheelchair" as const };
const free = { code: "GP-BBBBB-BBBBB", kind: "free_ticket" as const };

describe("codeStore", () => {
  let storage: Storage;
  beforeEach(() => { storage = fakeStorage(); });

  it("returns nothing for an unknown performance", () => {
    expect(readCodes(storage, "date-1")).toEqual([]);
  });

  it("round-trips codes for one performance", () => {
    writeCodes(storage, "date-1", [wc, free]);
    expect(readCodes(storage, "date-1")).toEqual([wc, free]);
  });

  it("keeps performances apart", () => {
    // A code applied while browsing one night must not follow you to another —
    // codes are event-scoped but seats are not, and the wrong date's unlock
    // would be confusing at best.
    writeCodes(storage, "date-1", [wc]);
    expect(readCodes(storage, "date-2")).toEqual([]);
  });

  it("clears one performance without touching the others", () => {
    writeCodes(storage, "date-1", [wc]);
    writeCodes(storage, "date-2", [free]);
    clearCodes(storage, "date-1");
    expect(readCodes(storage, "date-1")).toEqual([]);
    expect(readCodes(storage, "date-2")).toEqual([free]);
  });

  it("survives corrupt storage", () => {
    storage.setItem(CODE_STORE_KEY, "{not json");
    expect(readCodes(storage, "date-1")).toEqual([]);
  });

  it("ignores entries that are not shaped like codes", () => {
    storage.setItem(CODE_STORE_KEY, JSON.stringify({ "date-1": [{ nope: true }, wc] }));
    expect(readCodes(storage, "date-1")).toEqual([wc]);
  });

  it("tolerates undefined storage on the server", () => {
    expect(readCodes(undefined, "date-1")).toEqual([]);
    expect(() => writeCodes(undefined, "date-1", [wc])).not.toThrow();
    expect(() => clearCodes(undefined, "date-1")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/codeStore.test.ts`
Expected: FAIL — `Cannot find module '@/lib/codeStore'`

- [ ] **Step 3: Write the store**

Create `lib/codeStore.ts`:

```ts
import { normalizeCode, type CodeKind } from "@/lib/ticketCodes";

/**
 * Codes applied on the seat page, handed to the checkout page.
 *
 * sessionStorage, not the query string: a code in a URL lands in browser
 * history, in `Referer` headers, and in server logs. Keyed by performance so a
 * code applied while browsing one night does not follow you to another.
 *
 * Every function takes `Storage` explicitly so tests drive a fake and
 * server-side rendering can pass `undefined`, the same contract as
 * `lib/orderStore.ts`.
 */
export const CODE_STORE_KEY = "gp.codes.v1";

export interface AppliedCode {
  code: string;
  kind: CodeKind;
}

type Bag = Record<string, AppliedCode[]>;

function isAppliedCode(value: unknown): value is AppliedCode {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    normalizeCode(v.code) === v.code &&
    (v.kind === "wheelchair" || v.kind === "free_ticket")
  );
}

function readBag(storage: Storage | undefined): Bag {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CODE_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Bag) : {};
  } catch {
    // Corrupt or foreign. An empty bag costs the user one re-entry; throwing
    // would break the page that reads it.
    return {};
  }
}

function writeBag(storage: Storage | undefined, bag: Bag): void {
  if (!storage) return;
  try {
    storage.setItem(CODE_STORE_KEY, JSON.stringify(bag));
  } catch (err) {
    console.warn("Could not persist applied codes:", err);
  }
}

export function readCodes(storage: Storage | undefined, dateUuid: string): AppliedCode[] {
  const entries = readBag(storage)[dateUuid];
  return Array.isArray(entries) ? entries.filter(isAppliedCode) : [];
}

export function writeCodes(storage: Storage | undefined, dateUuid: string, codes: AppliedCode[]): void {
  const bag = readBag(storage);
  bag[dateUuid] = codes;
  writeBag(storage, bag);
}

export function clearCodes(storage: Storage | undefined, dateUuid: string): void {
  const bag = readBag(storage);
  delete bag[dateUuid];
  writeBag(storage, bag);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/codeStore.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the hook**

Create `components/TicketCodes/useTicketCodes.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeCode } from "@/lib/ticketCodes";
import { readCodes, writeCodes, clearCodes, type AppliedCode } from "@/lib/codeStore";

const storage = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

/**
 * Owns the codes a customer has applied to this performance.
 *
 * Validation here is advisory — it decides what the UI unlocks and what the
 * price preview shows. `POST /api/tickets/checkout` re-reads and claims every
 * code server-side, so nothing this hook believes can move money.
 */
export function useTicketCodes(eventUuid: string | undefined, dateUuid: string) {
  const [applied, setApplied] = useState<AppliedCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setApplied(readCodes(storage(), dateUuid));
  }, [dateUuid]);

  const persist = useCallback(
    (next: AppliedCode[]) => {
      setApplied(next);
      writeCodes(storage(), dateUuid, next);
    },
    [dateUuid],
  );

  const apply = useCallback(
    async (raw: string): Promise<boolean> => {
      setError(null);
      const code = normalizeCode(raw);
      if (!code) {
        setError("Deze code is niet geldig.");
        return false;
      }
      if (applied.some((a) => a.code === code)) {
        setError("Deze code is al toegevoegd.");
        return false;
      }
      if (applied.length >= 10) {
        setError("Je kan hoogstens 10 codes gebruiken.");
        return false;
      }
      if (!eventUuid) return false;

      setBusy(true);
      try {
        const res = await fetch("/api/tickets/codes/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventUuid, code }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Deze code is niet geldig.");
          return false;
        }
        persist([...applied, { code, kind: data.kind }]);
        return true;
      } catch {
        setError("Kon de code niet controleren. Probeer opnieuw.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applied, eventUuid, persist],
  );

  const remove = useCallback(
    (code: string) => {
      setError(null);
      persist(applied.filter((a) => a.code !== code));
    },
    [applied, persist],
  );

  const clear = useCallback(() => {
    setApplied([]);
    clearCodes(storage(), dateUuid);
  }, [dateUuid]);

  const wheelchairCount = useMemo(
    () => applied.filter((a) => a.kind === "wheelchair").length,
    [applied],
  );
  const freeCount = useMemo(
    () => applied.filter((a) => a.kind === "free_ticket").length,
    [applied],
  );

  return { applied, error, busy, apply, remove, clear, wheelchairCount, freeCount };
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/codeStore.ts lib/codeStore.test.ts components/TicketCodes/useTicketCodes.ts
git commit -m "feat: add code sessionStorage handoff and applied-codes hook"
```

---

### Task 8: Code entry panel and seat page wiring

**Files:**
- Create: `components/TicketCodes/CodeEntryPanel.tsx`
- Create: `components/TicketCodes/TicketCodes.module.css`
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`

**Interfaces:**
- Consumes: `useTicketCodes` (Task 7).
- Produces: nothing downstream.

- [ ] **Step 1: Write the panel**

Create `components/TicketCodes/CodeEntryPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { AppliedCode } from "@/lib/codeStore";
import styles from "./TicketCodes.module.css";

export default function CodeEntryPanel({
  applied,
  error,
  busy,
  onApply,
  onRemove,
}: {
  applied: AppliedCode[];
  error: string | null;
  busy: boolean;
  onApply: (raw: string) => Promise<boolean>;
  onRemove: (code: string) => void;
}) {
  const [value, setValue] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || value.trim().length === 0) return;
    if (await onApply(value)) setValue("");
  }

  return (
    <div className={styles.panel}>
      <form onSubmit={submit} className={styles.form}>
        <input
          type="text"
          className={styles.input}
          placeholder="GP-XXXXX-XXXXX"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="Code"
        />
        <button type="submit" className={styles.applyBtn} disabled={busy || value.trim().length === 0}>
          {busy ? "Bezig…" : "Toepassen"}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {applied.length > 0 && (
        <ul className={styles.chips}>
          {applied.map((a) => (
            <li key={a.code} className={styles.chip}>
              <span className={styles.chipKind}>
                {a.kind === "wheelchair" ? "Rolstoel" : "Gratis ticket"}
              </span>
              <span className={styles.chipCode}>{a.code}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => onRemove(a.code)}
                aria-label={`Verwijder code ${a.code}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the styles**

Create `components/TicketCodes/TicketCodes.module.css`:

```css
.panel {
  max-width: 520px;
  margin: 0 auto 1.5rem;
  padding: 0 1rem;
}

.notice {
  max-width: 620px;
  margin: 0 auto 1.25rem;
  padding: 0 1rem;
  text-align: center;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--cream-muted);
}

.notice a {
  color: var(--gold);
  text-decoration: underline;
}

.form {
  display: flex;
  gap: 0.5rem;
}

.input {
  flex: 1;
  padding: 0.6rem 0.85rem;
  border-radius: 6px;
  border: 1px solid rgba(245, 233, 213, 0.25);
  background: rgba(0, 0, 0, 0.3);
  color: var(--cream);
  font-family: monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.input:focus {
  outline: none;
  border-color: var(--gold);
}

.applyBtn {
  padding: 0.6rem 1.1rem;
  border-radius: 6px;
  border: 1px solid var(--gold);
  background: transparent;
  color: var(--gold);
  font-weight: 600;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.applyBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: #f87171;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(245, 233, 213, 0.2);
  font-size: 0.75rem;
}

.chipKind {
  color: var(--gold);
  font-weight: 600;
}

.chipCode {
  font-family: monospace;
  color: var(--cream-muted);
}

.chipRemove {
  border: none;
  background: transparent;
  color: var(--cream-muted);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.1rem;
}

.chipRemove:hover {
  color: #f87171;
}
```

- [ ] **Step 3: Wire the seat page**

In `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`, add imports:

```tsx
import CodeEntryPanel from "@/components/TicketCodes/CodeEntryPanel";
import { useTicketCodes } from "@/components/TicketCodes/useTicketCodes";
import { writeCodes } from "@/lib/codeStore";
import codeStyles from "@/components/TicketCodes/TicketCodes.module.css";
```

Add the hook and the wheelchair selection state next to the other `useState` calls (around line 73). **The hook must be called unconditionally**, before the `if (status === "loading") return …` early returns, or React will error on a changing hook count:

```tsx
  const codes = useTicketCodes(event?.uuid, dateId as string);
  // The unlocked wheelchair anchor is tracked separately from `selected`.
  // That array carries the contiguity rules; a wheelchair place is exempt from
  // them, and threading an exemption flag through isSelectable/toggleSeat
  // would put a special case inside logic that is currently uniform.
  const [wheelchairTicketId, setWheelchairTicketId] = useState<string | null>(null);
```

Give `handlePlaceClick` a non-admin branch:

```tsx
  function handlePlaceClick(groupId: string) {
    if (!isAdmin) {
      // A validated wheelchair code unlocks exactly one place.
      if (codes.wheelchairCount === 0) return;
      const anchorId = anchorTicketIdFor(groupId);
      if (!anchorId) return;
      setWheelchairTicketId((prev) => (prev === anchorId ? null : anchorId));
      return;
    }
    setSelected([]);
    setPlaceError(null);
    setSelectedGroupId((prev) => (prev === groupId ? null : groupId));
  }

  /** The one sellable ticket of a place — the only member with an exposed id. */
  function anchorTicketIdFor(groupId: string): string | null {
    for (const key in index.seatMap) {
      const cell = index.seatMap[key];
      if (cell.wheelchair_group_id === groupId && cell.seat_kind === "wheelchair") return cell.id;
    }
    return null;
  }
```

In `getPlaceCellStyle`, make an unlocked place look selectable and show when it is chosen. Replace the `active` line and the `cursor` line with:

```tsx
    const chosen = anchorTicketIdFor(cell.groupId) === wheelchairTicketId && wheelchairTicketId !== null;
    const active = cell.groupId === hoverGroup || cell.groupId === selectedGroupId || chosen;
```

and

```tsx
      cursor: isAdmin || codes.wheelchairCount > 0 ? "pointer" : "not-allowed",
      background: chosen ? SEAT.selected : SEAT.wheelchair,
```

(replacing the existing `background: SEAT.wheelchair,` line).

Add the notice under the section label — replace the `<SectionLabel>Choose Your Seats</SectionLabel>` line (around line 420) with:

```tsx
      <SectionLabel>Choose Your Seats</SectionLabel>

      <p className={codeStyles.notice}>
        wil je een rolstoel plaats reserveren, mail naar{" "}
        <a href="mailto:gentlemanproductions.official@gmail.com">
          gentlemanproductions.official@gmail.com
        </a>
        , heb je een code gekregen, geef deze onderaan de pagina in.
      </p>
```

Add the panel immediately before `<div className={styles.bottomBar}>` (around line 559):

```tsx
      <CodeEntryPanel
        applied={codes.applied}
        error={codes.error}
        busy={codes.busy}
        onApply={codes.apply}
        onRemove={codes.remove}
      />
```

Show the discount in the bottom bar — replace the `priceLine` block:

```tsx
          {(selected.length > 0 || wheelchairTicketId) && (
            <div className={styles.priceLine}>
              €{price.toFixed(2)} per seat
              {codes.freeCount > 0 && ` · ${codes.freeCount} gratis`}
            </div>
          )}
```

Finally, carry the selection and the codes to checkout. Replace the Continue button's `onClick` and `disabled`:

```tsx
            disabled={selected.length === 0 && !wheelchairTicketId}
            onClick={() => {
              const all = [...selected, ...(wheelchairTicketId ? [wheelchairTicketId] : [])];
              if (all.length === 0) return;
              writeCodes(window.sessionStorage, dateId as string, codes.applied);
              router.push(`/event/${id}/ticket/${dateId}/checkout?tickets=${all.join(",")}`);
            }}
```

and its label:

```tsx
            {selected.length > 0 || wheelchairTicketId ? "Continue →" : "Select seats"}
```

- [ ] **Step 4: Typecheck, build, test**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/TicketCodes "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx"
git commit -m "feat: add code entry to the seat page and unlock wheelchair places"
```

---

### Task 9: Admin code generator on the seat page

**Files:**
- Create: `components/TicketCodes/AdminCodeGenerator.tsx`
- Modify: `components/TicketCodes/TicketCodes.module.css` (append)
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`

**Interfaces:**
- Consumes: `POST /api/tickets/admin/codes` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Write the component**

Create `components/TicketCodes/AdminCodeGenerator.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { CodeKind } from "@/lib/ticketCodes";
import styles from "./TicketCodes.module.css";

export default function AdminCodeGenerator({ eventUuid }: { eventUuid: string }) {
  const [kind, setKind] = useState<CodeKind>("wheelchair");
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A wheelchair code unlocks one place, so the server forces this to 1
        // regardless of what is sent.
        body: JSON.stringify({ eventUuid, kind, label, quantity: kind === "wheelchair" ? 1 : quantity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Kon de codes niet aanmaken. Probeer opnieuw.");
        return;
      }
      setGenerated((data.codes as { code: string }[]).map((c) => c.code));
      setLabel("");
    } catch {
      setError("Kon de codes niet aanmaken. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.adminTitle}>Codes aanmaken</h3>
      <form onSubmit={submit} className={styles.adminForm}>
        <select
          className={styles.input}
          value={kind}
          onChange={(e) => setKind(e.target.value as CodeKind)}
          aria-label="Codetype"
        >
          <option value="wheelchair">Rolstoelplaats</option>
          <option value="free_ticket">Gratis ticket</option>
        </select>
        <input
          type="text"
          className={styles.input}
          placeholder="Voor wie? (bv. Jan Peeters)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        {kind === "free_ticket" && (
          <input
            type="number"
            className={styles.qtyInput}
            min={1}
            max={50}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            aria-label="Aantal"
          />
        )}
        <button type="submit" className={styles.applyBtn} disabled={busy || label.trim().length === 0}>
          {busy ? "Bezig…" : "Aanmaken"}
        </button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {generated.length > 0 && (
        <div className={styles.generated}>
          <p className={styles.generatedHint}>
            Kopieer deze codes nu — je vindt ze later ook in het adminportaal.
          </p>
          <ul className={styles.generatedList}>
            {generated.map((code) => (
              <li key={code} className={styles.generatedCode}>
                <code>{code}</code>
                <button
                  type="button"
                  className={styles.copyBtn}
                  onClick={() => navigator.clipboard?.writeText(code)}
                >
                  Kopieer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append the styles**

Append to `components/TicketCodes/TicketCodes.module.css`:

```css
.adminTitle {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
}

.adminForm {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.qtyInput {
  width: 5rem;
  padding: 0.6rem 0.85rem;
  border-radius: 6px;
  border: 1px solid rgba(245, 233, 213, 0.25);
  background: rgba(0, 0, 0, 0.3);
  color: var(--cream);
}

.generated {
  margin-top: 0.75rem;
}

.generatedHint {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  color: var(--cream-muted);
}

.generatedList {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.generatedCode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  border-radius: 6px;
  border: 1px solid rgba(245, 233, 213, 0.15);
  font-family: monospace;
  letter-spacing: 0.08em;
}

.copyBtn {
  border: none;
  background: transparent;
  color: var(--gold);
  cursor: pointer;
  font-size: 0.75rem;
  font-family: inherit;
}
```

- [ ] **Step 3: Mount it on the seat page**

In `SeatMapClient.tsx`, add the import:

```tsx
import AdminCodeGenerator from "@/components/TicketCodes/AdminCodeGenerator";
```

and render it directly above `<CodeEntryPanel …>`:

```tsx
      {isAdmin && <AdminCodeGenerator eventUuid={event.uuid} />}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/TicketCodes "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx"
git commit -m "feat: let admins generate codes from the seat page"
```

---

### Task 10: Checkout page — discount preview and the free path

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/checkout/page.tsx`

**Interfaces:**
- Consumes: `readCodes`, `clearCodes` (Task 7); `computeOrderTotalCents` (Task 1); the checkout route's `{ orderId, free: true }` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Load and re-validate the codes**

Add imports:

```tsx
import { useRouter } from "next/navigation";
import { readCodes, clearCodes, type AppliedCode } from "@/lib/codeStore";
import { computeOrderTotalCents } from "@/lib/ticketCodes";
```

Add state and a router next to the existing `useState` calls:

```tsx
  const router = useRouter();
  const [codes, setCodes] = useState<AppliedCode[]>([]);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);
```

Add this effect after the existing data-loading effect. It re-checks every stored code so a stale entry fails here, with an explanation, rather than at the pay button:

```tsx
  useEffect(() => {
    let cancelled = false;
    const stored = readCodes(window.sessionStorage, dateId as string);
    if (stored.length === 0 || !event) return;

    const run = async () => {
      const surviving: AppliedCode[] = [];
      for (const entry of stored) {
        try {
          const res = await fetch("/api/tickets/codes/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventUuid: event.uuid, code: entry.code }),
          });
          if (res.ok) surviving.push(entry);
        } catch {
          // Network trouble is not proof the code is bad. Keep it — checkout
          // re-checks server-side and is the only authority anyway.
          surviving.push(entry);
        }
      }
      if (cancelled) return;
      setCodes(surviving);
      if (surviving.length < stored.length) {
        setCodeNotice("Eén of meer codes zijn niet meer geldig en zijn verwijderd.");
      }
    };
    run();
    return () => { cancelled = true; };
  }, [dateId, event]);
```

- [ ] **Step 2: Show the discount**

Replace the total calculation:

```tsx
  const pricePerSeat = date.price ?? 0;
  const freeCount = codes.filter((c) => c.kind === "free_ticket").length;
  const totalCents = computeOrderTotalCents({
    seatCount: ticketIds.length,
    priceCents: Math.round(pricePerSeat * 100),
    freeCodeCount: freeCount,
  });
  const total = totalCents / 100;
```

and add a discount row directly above the existing `.totalRow` block:

```tsx
          {freeCount > 0 && (
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>
                {freeCount} gratis ticket{freeCount !== 1 ? "s" : ""}
              </span>
              <span className={styles.totalValue}>
                &minus;&euro;{(freeCount * pricePerSeat).toFixed(2)}
              </span>
            </div>
          )}
          {codeNotice && <p className={styles.error}>{codeNotice}</p>}
```

- [ ] **Step 3: Send the codes and handle the free response**

In `handleSubmit`, add `codes` to the request body:

```tsx
        body: JSON.stringify({
          eventUuid: id,
          dateUuid: dateId,
          ticketIds,
          name,
          email,
          codes: codes.map((c) => c.code),
        }),
```

and handle the €0 response immediately after `const data = await res.json();`:

```tsx
      // No payment step exists for a fully discounted order — the server has
      // already sold the seats and sent the tickets.
      if (data.free && data.orderId) {
        addOrder(typeof window === "undefined" ? undefined : window.localStorage, {
          orderId: data.orderId,
          eventUuid: id as string,
          dateUuid: dateId as string,
          eventTitle: event!.title,
          startTime: date!.start_time,
          seatLabels: chosenSeats.map((t) => `${t.seat.row}${t.seat.seat_number}`),
          email,
          savedAt: new Date().toISOString(),
          lastKnownStatus: "pending",
          statusChangedAt: new Date().toISOString(),
        });
        clearCodes(window.sessionStorage, dateId as string);
        router.push(`/event/${id}/ticket/${dateId}/confirm?order=${data.orderId}`);
        return;
      }
```

`lastKnownStatus` stays `"pending"` on purpose: the confirm page polls and flips it, which is the path every other order already takes.

In the existing `if (data.checkoutUrl)` branch, add `clearCodes(window.sessionStorage, dateId as string);` immediately before `window.location.href = data.checkoutUrl;`.

- [ ] **Step 4: Update the pay button**

```tsx
          <button type="submit" disabled={submitting} className={styles.payBtn}>
            {submitting
              ? "Redirecting to payment..."
              : total === 0
                ? "Bevestig gratis tickets"
                : `Pay €${total.toFixed(2)}`}
          </button>
```

- [ ] **Step 5: Typecheck, build, test**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/checkout/page.tsx"
git commit -m "feat: show code discount at checkout and handle free orders"
```

---

### Task 11: Codes section in the admin portal

**Files:**
- Modify: `app/private/admin-portal/page.tsx`
- Modify: `app/private/admin-portal/AdminPortal.module.css` (append)

**Interfaces:**
- Consumes: `GET /api/tickets/admin/codes`, `POST /api/tickets/admin/codes/[id]/revoke` (Task 5); `CodeRow` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Add state and loading**

Add the row type near the other interfaces:

```tsx
interface CodeRow {
  id: string;
  code: string;
  kind: "wheelchair" | "free_ticket";
  label: string;
  event_uuid: string;
  created_at: string;
  state: "unused" | "in_use" | "used" | "revoked";
  order_id: string | null;
}

const CODE_STATE_LABEL: Record<CodeRow["state"], string> = {
  unused: "ongebruikt",
  in_use: "in gebruik",
  used: "gebruikt",
  revoked: "ingetrokken",
};
```

Add state inside the component:

```tsx
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [revoking, setRevoking] = useState<string | null>(null);
```

In the existing `load()` effect, fetch the codes alongside the summary. Replace the `const res = await fetch("/api/tickets/summary");` line and its two followers with:

```tsx
        const [res, codesRes] = await Promise.all([
          fetch("/api/tickets/summary"),
          fetch("/api/tickets/admin/codes"),
        ]);
        if (!res.ok) throw new Error("Failed to load summary");
        const json = (await res.json()) as SummaryResponse;
        if (!cancelled) setData(json);
        // A code-listing failure must not blank the whole portal — the
        // summary is the page's primary content.
        if (codesRes.ok && !cancelled) {
          setCodes(((await codesRes.json()) as { codes: CodeRow[] }).codes);
        }
```

- [ ] **Step 2: Add the revoke handler**

Add next to the other handlers:

```tsx
  async function handleRevoke(row: CodeRow) {
    const confirmed = window.confirm(
      `Code ${row.code} intrekken? Hij kan daarna niet meer gebruikt worden.`,
    );
    if (!confirmed) return;

    setRevoking(row.id);
    try {
      const res = await fetch(`/api/tickets/admin/codes/${row.id}/revoke`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(body.error ?? "Kon de code niet intrekken.");
        return;
      }
      setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, state: "revoked" } : c)));
    } finally {
      setRevoking(null);
    }
  }
```

- [ ] **Step 3: Render the section**

Add before the closing `</Stack>`:

```tsx
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Codes</h2>
        {codes.length === 0 ? (
          <p className={styles.empty}>Nog geen codes aangemaakt.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type</th>
                  <th>Voor</th>
                  <th>Status</th>
                  <th>Aangemaakt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className={styles.codeCell}>{c.code}</td>
                    <td>{c.kind === "wheelchair" ? "Rolstoelplaats" : "Gratis ticket"}</td>
                    <td>{c.label}</td>
                    <td>
                      <span className={`${styles.badge} ${badgeClassForCode(c.state)}`}>
                        {CODE_STATE_LABEL[c.state]}
                      </span>
                    </td>
                    <td>{new Date(c.created_at).toLocaleString("en-GB")}</td>
                    <td>
                      {c.state === "unused" && (
                        <button
                          type="button"
                          className={styles.releaseBtn}
                          disabled={revoking === c.id}
                          onClick={() => handleRevoke(c)}
                        >
                          {revoking === c.id ? "Bezig…" : "Intrekken"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
```

Add the badge helper next to the existing `badgeClass`:

```tsx
function badgeClassForCode(state: CodeRow["state"]): string {
  switch (state) {
    case "used":
      return styles.badgePaid;
    case "revoked":
      return styles.badgeCancelled;
    default:
      return styles.badgePending;
  }
}
```

- [ ] **Step 4: Append the style**

Append to `app/private/admin-portal/AdminPortal.module.css`:

```css
.codeCell {
  font-family: monospace;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
```

- [ ] **Step 5: Typecheck, build, full suite**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/private/admin-portal/page.tsx app/private/admin-portal/AdminPortal.module.css
git commit -m "feat: list and revoke ticket codes in the admin portal"
```

---

## Deployment

One manual step, unlike spec 1's three: run `scripts/ticketing-schema.sql` against `DATABASE_URL`. Everything it adds for this feature is `create table if not exists` / `create index if not exists`, so re-running the whole file is safe and touches nothing spec 1 already applied.

No environment variables are added. `TICKET_QR_SECRET` is still required — the €0 path issues real tickets and checkout already refuses to run without it.

## Manual verification

Needs a migrated database and an ADMIN login.

1. On a performance's seat page as ADMIN, generate one wheelchair code and two free-ticket codes.
2. Log out. The wheelchair place is blue and unclickable; the notice text and code box are visible.
3. Enter the wheelchair code → **Toepassen**. The place becomes clickable; selecting it turns it gold. Pick two ordinary seats elsewhere — the wheelchair place does not force them to be adjacent to it.
4. Continue. Checkout shows three tickets and no discount; pay through Mollie test mode; tickets arrive.
5. Re-enter the same wheelchair code → `Deze code is al gebruikt.`
6. New order: one seat plus one free-ticket code → total €0, button reads **Bevestig gratis tickets**, confirm page shows a paid order and the ticket email arrives with no Mollie payment.
7. In the portal, the spent codes read *gebruikt* with no Revoke button; the unused one reads *ongebruikt* and revokes.
8. Start a checkout with the second free code, abandon it at Mollie, wait for the payment to expire (or run the reconcile cron) → the code returns to *ongebruikt*.

## Out of scope

Carried over from the spec: no expiry dates on codes, no multi-ticket codes, no editing a code after generation, no distributed rate limiting, no emailing codes from the portal.
