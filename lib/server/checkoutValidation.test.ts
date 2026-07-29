import { describe, it, expect } from "vitest";
import { validateCheckoutInput, isUuid, MAX_SEATS_PER_ORDER } from "@/lib/server/checkoutValidation";

const uuid = (n: number) => `3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f${String(n).padStart(2, "0")}`;
const EVENT_UUID = "3221982d-cbfa-476c-ad28-8f609559e4e6";
const base = {
  // eventUuid must be a real uuid (events.uuid is a `uuid` column); dateUuid
  // is compared against `text` columns, so a non-uuid stays valid there.
  eventUuid: EVENT_UUID, dateUuid: "date-1",
  ticketIds: [uuid(1), uuid(2)],
  name: "Ada Lovelace", email: "ada@example.com",
};

describe("isUuid", () => {
  it("accepts a canonical uuid and rejects anything else", () => {
    expect(isUuid(uuid(1))).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(`${uuid(1)} OR 1=1`)).toBe(false);
  });
});

describe("validateCheckoutInput", () => {
  it("accepts a well-formed order", () => {
    const result = validateCheckoutInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(1), uuid(2)]);
  });

  it("rejects a missing body", () => {
    expect(validateCheckoutInput(null).ok).toBe(false);
  });

  it("rejects each missing required field", () => {
    for (const key of ["eventUuid", "dateUuid", "name", "email"] as const) {
      expect(validateCheckoutInput({ ...base, [key]: "" }).ok).toBe(false);
    }
  });

  it("rejects a malformed eventUuid before it can reach the uuid column", () => {
    expect(validateCheckoutInput({ ...base, eventUuid: "event-1" }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, eventUuid: "'; DROP TABLE events; --" }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, eventUuid: `${EVENT_UUID}x` }).ok).toBe(false);
  });

  it("still accepts a non-uuid dateUuid, which is matched against text columns", () => {
    expect(validateCheckoutInput({ ...base, dateUuid: "date-1" }).ok).toBe(true);
  });

  it("rejects an empty basket", () => {
    expect(validateCheckoutInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_SEATS_PER_ORDER} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_ORDER + 1 }, (_, i) => uuid(i));
    expect(validateCheckoutInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it(`accepts exactly ${MAX_SEATS_PER_ORDER} seats`, () => {
    const exact = Array.from({ length: MAX_SEATS_PER_ORDER }, (_, i) => uuid(i));
    expect(validateCheckoutInput({ ...base, ticketIds: exact }).ok).toBe(true);
  });

  it("deduplicates ticket ids so a repeated seat is billed once", () => {
    const result = validateCheckoutInput({ ...base, ticketIds: [uuid(1), uuid(1), uuid(2)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(1), uuid(2)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateCheckoutInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(validateCheckoutInput({ ...base, email: "ada[at]example.com" }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, email: "ada@example" }).ok).toBe(false);
  });

  it("rejects an over-long name and email", () => {
    expect(validateCheckoutInput({ ...base, name: "a".repeat(121) }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, email: `${"a".repeat(250)}@example.com` }).ok).toBe(false);
  });

  it("trims whitespace off name and email", () => {
    const result = validateCheckoutInput({ ...base, name: "  Ada  ", email: "  ada@example.com  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Ada");
      expect(result.value.email).toBe("ada@example.com");
    }
  });

  it("rejects non-string and non-array shapes", () => {
    expect(validateCheckoutInput({ ...base, ticketIds: "not-an-array" as never }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, name: 42 as never }).ok).toBe(false);
  });
});
