import { describe, it, expect } from "vitest";
import {
  CODE_ALPHABET,
  normalizeCode,
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
