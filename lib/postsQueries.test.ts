import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// ============================================================================
// Reading a single post by id.
//
// The detail pages (event, ticket, seat map, checkout) all read a post through
// this and drop the result into `useState` once per mount. That makes it the
// only thing standing between an admin's edit and what those pages render —
// if it can hand back a copy that a mutation already invalidated, the edit is
// invisible. Deletes and creations hid this: those are watched on the list
// surfaces, which re-render straight off `useQuery`.
// ============================================================================

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiGet: mocks.apiGet }));

import { fetchPostById, postsQueryKeys } from "./postsQueries";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Mirrors the production defaults from `app/providers/QueryProvider.tsx`. */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: ONE_HOUR_MS, gcTime: ONE_HOUR_MS, retry: false },
    },
  });
}

const EVENT_ID = "21ea589e-56b1-4b14-a904-42874522f22d";

function event(title: string) {
  return { uuid: EVENT_ID, post_type: "EVENT", title };
}

beforeEach(() => {
  mocks.apiGet.mockReset();
});

describe("fetchPostById", () => {
  it("serves a cached post without going back to the network", async () => {
    mocks.apiGet.mockResolvedValue(event("Original"));
    const queryClient = makeClient();

    await fetchPostById(queryClient, EVENT_ID);
    const second = await fetchPostById(queryClient, EVENT_ID);

    expect(mocks.apiGet).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ title: "Original" });
  });

  it("re-reads an edited post once a mutation has invalidated it", async () => {
    // The bug: an admin edits an event, the mutation invalidates the post
    // data, and the event page still renders the pre-edit copy.
    mocks.apiGet.mockResolvedValue(event("Original"));
    const queryClient = makeClient();

    // The list query is what a detail page arrives with in cache — populated
    // and persisted to localStorage on the way in.
    queryClient.setQueryData(postsQueryKeys.all, [event("Original")]);
    await fetchPostById(queryClient, EVENT_ID);

    // What `invalidatePostData()` does after a successful edit.
    mocks.apiGet.mockResolvedValue(event("Edited"));
    await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });

    const afterEdit = await fetchPostById(queryClient, EVENT_ID);

    expect(afterEdit).toMatchObject({ title: "Edited" });
  });

  it("does not hand back a post the list cache never revalidated", async () => {
    // A stale list restored from localStorage must not be treated as truth:
    // with a 1h staleTime it is considered fresh on restore, so nothing would
    // ever refetch it on its own.
    mocks.apiGet.mockResolvedValue(event("Current"));
    const queryClient = makeClient();
    queryClient.setQueryData(postsQueryKeys.all, [event("Stale from storage")]);
    await queryClient.invalidateQueries({ queryKey: postsQueryKeys.all });

    const result = await fetchPostById(queryClient, EVENT_ID);

    expect(result).toMatchObject({ title: "Current" });
  });

  it("returns null when the post cannot be fetched", async () => {
    mocks.apiGet.mockRejectedValue(new Error("Event not found"));

    expect(await fetchPostById(makeClient(), EVENT_ID)).toBeNull();
  });
});
