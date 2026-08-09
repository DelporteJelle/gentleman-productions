# Caching

Post data is cached in two places. The rule that keeps them correct:

> **Every layer that can hold a post payload must be purgeable by a mutation.**

## The layers

### 1. Server-side data cache (`lib/server/postsData.ts`)

The database reads for `/api/posts` and `/api/highlight` are wrapped in
`unstable_cache` under a cache tag:

| Reader              | Tag         | Backstop TTL |
| ------------------- | ----------- | ------------ |
| `fetchPostsPage()`  | `posts`     | 1 day        |
| `fetchEventById()`  | `posts`     | 1 day        |
| `fetchHighlight()`  | `highlight` | 1 day        |

This is what keeps traffic off Neon — repeat requests are served from the cache
across all visitors. The TTL is only a backstop; the real freshness mechanism is
tag invalidation, which is immediate.

### 2. TanStack Query (client, `app/providers/QueryProvider.tsx`)

`staleTime`/`gcTime` of 1 hour, persisted to `localStorage` with a matching
`maxAge`. Mutations in `PostsContext` invalidate the affected query keys, so
this layer never outlives an edit either.

### 3. Prerendered pages

`/` and `/sitemap.xml` are static with a 1-hour revalidate and embed event data
(JSON-LD). Post mutations call `revalidatePath("/")`.

No layer is configured above **one day**.

## Invalidation

Every mutating route calls `invalidateCache(tag)` from `lib/server/api.ts`,
which calls `revalidateTag(tag)` and purges the prerendered pages built from the
same data. `CacheTags.POSTS` also purges `highlight`, because the highlight
endpoint `INNER JOIN`s the post tables — editing or deleting a post changes that
payload too.

On the client, post mutations call `invalidatePostData()`, which invalidates
both the `posts` and `highlight` query keys for the same reason.

## Reading one post

The detail pages (event, ticket, seat map, checkout) read a single post through
`fetchPostById()` in `lib/postsQueries.ts`. It must go through `fetchQuery` on
the `["posts", id]` key — **not** `getQueryData` on the list.

`getQueryData` is a synchronous cache peek: it ignores `staleTime`, ignores
invalidation, and never fetches. That was the second bug — creating and
deleting posts looked fine because the list surfaces re-render straight off
`useQuery`, but an *edited* event kept rendering its pre-edit copy on every
detail page, because those pages read through the peek into `useState` once per
mount. `byId` sits under the `posts` key prefix, so the invalidation a mutation
already fires reaches it and the next read revalidates.

`lib/postsQueries.test.ts` covers this.

## Why responses are `no-store`

`cachedResponse()` sends `Cache-Control: no-store, must-revalidate`.

This is deliberate and must not be "optimised" back into
`public, s-maxage=...`. A response cached by that header lives in **shared
caches (Vercel's edge network) keyed by URL**, and neither `revalidateTag` nor
`revalidatePath` can evict it — those only reach Next's own caches. That was the
original bug: an admin deleted a post, the client correctly refetched, and the
CDN answered with the pre-delete JSON for up to seven days.

The API routes are dynamic (`ƒ` in the build output), so they have no route
cache of their own; `export const revalidate` on them did nothing at all.

Database load is handled by layer 1 instead, which is purgeable. The trade-off
is that a GET now invokes the serverless function even on a cache hit — it just
doesn't reach the database.

`lib/server/api.test.ts` enforces both halves of this: no shared-cache headers,
and no lifetime above one day.
