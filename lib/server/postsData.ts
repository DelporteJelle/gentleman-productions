/**
 * Cached database reads for post data.
 *
 * These wrap the queries in Next's data cache under a tag, so repeat requests
 * are served without touching Neon while a mutation can still purge them
 * instantly via `invalidateCache` (which calls `revalidateTag`). The previous
 * approach — a long `Cache-Control: s-maxage` on the response — kept the
 * payload in shared caches keyed by URL, where nothing could evict it, so a
 * deleted post stayed on screen until the entry expired.
 */

import { unstable_cache } from "next/cache";
import { getDb, CacheTags, MAX_CACHE_TTL_SECONDS } from "./api";

export interface PostsPage {
  data: unknown[];
  total: number;
}

/**
 * Read a page of posts, optionally narrowed to a single post type.
 *
 * `unstable_cache` keys on the arguments, so each type/page/limit combination
 * gets its own entry and all of them share the `posts` tag.
 */
export const fetchPostsPage = unstable_cache(
  async (
    type: string | null,
    page: number,
    limit: number,
  ): Promise<PostsPage> => {
    const sql = getDb();
    const offset = (page - 1) * limit;

    if (type === "EVENT") {
      const posts = await sql`
        SELECT
          posts.created_at AS post_created_at,
          events.*
        FROM posts
        JOIN events ON posts.post_uuid::uuid = events.uuid
        ORDER BY posts.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const total = await sql`SELECT COUNT(*) FROM events;`;
      return { data: posts, total: parseInt(total[0].count, 10) };
    }

    if (type === "BASIC_POST") {
      const posts = await sql`
        SELECT
          posts.created_at AS post_created_at,
          basic_posts.*
        FROM posts
        JOIN basic_posts ON posts.post_uuid::uuid = basic_posts.uuid
        ORDER BY posts.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const total = await sql`SELECT COUNT(*) FROM basic_posts;`;
      return { data: posts, total: parseInt(total[0].count, 10) };
    }

    // Both types, fetched separately and merged in JS to avoid UNION type
    // mismatches between the two tables.
    const [eventRows, basicPostRows] = await Promise.all([
      sql`
        SELECT
          posts.created_at AS post_created_at,
          events.*
        FROM posts
        JOIN events ON posts.post_uuid::uuid = events.uuid
        ORDER BY posts.created_at DESC
      `,
      sql`
        SELECT
          posts.created_at AS post_created_at,
          basic_posts.*
        FROM posts
        JOIN basic_posts ON posts.post_uuid::uuid = basic_posts.uuid
        ORDER BY posts.created_at DESC
      `,
    ]);

    const allPosts = [...eventRows, ...basicPostRows].sort(
      (a: any, b: any) =>
        new Date(b.post_created_at || b.created_at).getTime() -
        new Date(a.post_created_at || a.created_at).getTime(),
    );

    return {
      data: allPosts.slice(offset, page * limit),
      total: allPosts.length,
    };
  },
  ["posts-page"],
  { tags: [CacheTags.POSTS], revalidate: MAX_CACHE_TTL_SECONDS },
);

/**
 * Read a single event by uuid.
 *
 * The detail pages read one post at a time rather than leaning on the list, so
 * this is on the path of every event page view — tagged like the rest so it
 * stays off the database without being able to outlive an edit.
 */
export const fetchEventById = unstable_cache(
  async (id: string): Promise<unknown | null> => {
    const sql = getDb();
    const rows = await sql`SELECT * FROM events WHERE uuid = ${id};`;
    return rows[0] ?? null;
  },
  ["event-by-id"],
  { tags: [CacheTags.POSTS], revalidate: MAX_CACHE_TTL_SECONDS },
);

/**
 * Read the highlighted post, which may be either an event or a basic post.
 */
export const fetchHighlight = unstable_cache(
  async (): Promise<unknown[]> => {
    const sql = getDb();

    const highlightWithEvent = await sql`
      SELECT Events.*, Highlight.valid_date
      FROM Events
      INNER JOIN Highlight ON Events.uuid = Highlight.event_uuid;
    `;
    if (highlightWithEvent.length > 0) return highlightWithEvent;

    return sql`
      SELECT basic_posts.*, Highlight.valid_date
      FROM basic_posts
      INNER JOIN Highlight ON basic_posts.uuid = Highlight.event_uuid;
    `;
  },
  ["highlight"],
  { tags: [CacheTags.HIGHLIGHT], revalidate: MAX_CACHE_TTL_SECONDS },
);
