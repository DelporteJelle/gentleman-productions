import type { QueryClient } from "@tanstack/react-query";
import type { Post } from "@/types";
import { apiGet } from "@/lib/api";

export const postsQueryKeys = {
  all: ["posts"] as const,
  byId: (id: string) => ["posts", id] as const,
  highlight: ["highlight"] as const,
};

/**
 * Read a single post by id, going back to the server whenever the cached copy
 * has been invalidated.
 *
 * This runs through `fetchQuery` rather than reading the list cache with
 * `getQueryData`. That peek was synchronous: it ignored `staleTime`, ignored
 * invalidation, and never triggered a fetch, so an edited event kept rendering
 * its pre-edit copy on every detail page. `byId` sits under the `posts` key
 * prefix, so the invalidation a mutation already fires marks it stale too and
 * the next read refetches.
 */
export async function fetchPostById(
  queryClient: QueryClient,
  id: string,
): Promise<Post | null> {
  try {
    return await queryClient.fetchQuery({
      queryKey: postsQueryKeys.byId(id),
      queryFn: () => apiGet<Post>(`/api/events/${id}`),
    });
  } catch {
    return null;
  }
}
