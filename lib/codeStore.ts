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
