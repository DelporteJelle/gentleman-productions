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
