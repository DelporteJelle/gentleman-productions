import { describe, it, expect } from "vitest";
import { paymentAmountMatchesOrder } from "@/lib/server/orderFulfillment";

describe("paymentAmountMatchesOrder", () => {
  it("matches Mollie's decimal string against the stored cent total", () => {
    expect(paymentAmountMatchesOrder("18.00", 1800)).toBe(true);
    expect(paymentAmountMatchesOrder("22.50", 2250)).toBe(true);
    expect(paymentAmountMatchesOrder("0.01", 1)).toBe(true);
  });

  it("rejects an underpayment or overpayment", () => {
    expect(paymentAmountMatchesOrder("17.99", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("1.00", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("180.00", 1800)).toBe(false);
  });

  it("rejects unparseable amounts instead of treating them as zero", () => {
    expect(paymentAmountMatchesOrder("", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("free", 1800)).toBe(false);
  });

  it("is immune to floating point drift on large orders", () => {
    expect(paymentAmountMatchesOrder("360.00", 36000)).toBe(true);
    expect(paymentAmountMatchesOrder("446.70", 44670)).toBe(true);
  });
});
