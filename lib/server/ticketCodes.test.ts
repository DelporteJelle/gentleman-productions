import { describe, it, expect } from "vitest";
import {
  MAX_CODES_PER_ORDER,
  normalizeCodeList,
  claimCodes,
  releaseCodesForOrder,
  validateGenerateInput,
  generateCode,
  MAX_BATCH,
} from "@/lib/server/ticketCodes";
import { CODE_ALPHABET, normalizeCode } from "@/lib/ticketCodes";

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

    if (head.startsWith("UPDATE ticket_codes SET used_by_order_id =") && full.includes("used_at = now()")) {
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
