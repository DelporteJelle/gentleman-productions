import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Cache correctness for post data.
//
// The rule these tests encode: every cache layer that can hold a post payload
// must be purgeable by a mutation. A `Cache-Control: s-maxage` entry is not —
// it lives in shared caches keyed by URL, where neither `revalidateTag` nor
// `revalidatePath` can reach it — so an admin edit stayed invisible until it
// expired on its own. Freshness comes from the tagged server-side data cache
// instead, and these tests are what stops the header from creeping back.
// ============================================================================

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
  unstable_cache: (fn: unknown) => fn,
}));

import {
  cachedResponse,
  invalidateCache,
  CacheTags,
  MAX_CACHE_TTL_SECONDS,
} from "./api";

beforeEach(() => {
  mocks.revalidateTag.mockClear();
  mocks.revalidatePath.mockClear();
});

/** Every `<directive>=<seconds>` pair in a Cache-Control header. */
function cacheLifetimes(header: string): Array<[string, number]> {
  return [...header.matchAll(/([a-z-]+)=(\d+)/g)].map(([, name, value]) => [
    name,
    Number(value),
  ]);
}

describe("cachedResponse", () => {
  it("does not let a shared cache store the payload", () => {
    const header = cachedResponse({ data: [] }).headers.get("cache-control");

    expect(header).toBeTruthy();
    // `public`/`s-maxage` is what put the payload in the CDN, where no
    // mutation could evict it.
    expect(header).not.toMatch(/\bpublic\b/);
    expect(header).not.toMatch(/\bs-maxage\b/);
    expect(header).toMatch(/\bno-store\b/);
  });

  it("never grants any cache a lifetime beyond one hour", () => {
    const header = cachedResponse({ data: [] }).headers.get("cache-control")!;

    for (const [directive, seconds] of cacheLifetimes(header)) {
      expect(
        seconds,
        `Cache-Control "${directive}" exceeds the one-hour ceiling`,
      ).toBeLessThanOrEqual(MAX_CACHE_TTL_SECONDS);
    }
  });

  it("caps the server-side data cache at one hour", () => {
    expect(MAX_CACHE_TTL_SECONDS).toBeLessThanOrEqual(60 * 60);
  });
});

describe("invalidateCache", () => {
  it("purges the posts tag, which is what actually holds the data", () => {
    invalidateCache(CacheTags.POSTS);

    // `{ expire: 0 }` and not a stale-while-revalidate profile: an admin who
    // just deleted a post must not be served the pre-delete payload again.
    expect(mocks.revalidateTag).toHaveBeenCalledWith(CacheTags.POSTS, {
      expire: 0,
    });
  });

  it("purges the highlight alongside posts", () => {
    // The highlight endpoint INNER JOINs the post tables, so deleting or
    // editing a post changes its payload too. Without this cascade a deleted
    // post kept being served as the highlight.
    invalidateCache(CacheTags.POSTS);

    expect(mocks.revalidateTag).toHaveBeenCalledWith(CacheTags.HIGHLIGHT, {
      expire: 0,
    });
  });

  it("purges the statically rendered home page for post changes", () => {
    // `/` is prerendered with a 1h revalidate and embeds event JSON-LD.
    invalidateCache(CacheTags.POSTS);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("keeps unrelated tags independent", () => {
    invalidateCache(CacheTags.TEAM);

    const purgedTags = mocks.revalidateTag.mock.calls.map(([tag]) => tag);
    expect(purgedTags).toEqual([CacheTags.TEAM]);
  });
});
