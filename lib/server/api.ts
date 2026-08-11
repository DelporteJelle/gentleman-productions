/**
 * Server-side API utilities for Next.js API routes.
 * Provides consistent response handling, authentication, and database access.
 */

import { NextResponse } from "next/server";
import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";
import { revalidatePath, revalidateTag } from "next/cache";

// ============================================================================
// Database
// ============================================================================

/**
 * Get a database connection
 */
export function getDb(): NeonQueryFunction<false, false> {
  return neon(process.env.DATABASE_URL!);
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a successful JSON response
 */
export function jsonResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(data, { status, headers });
}

/**
 * Create an error response
 */
export function errorResponse(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Create a success message response
 */
export function successResponse(message: string, status = 200): NextResponse {
  return NextResponse.json({ message }, { status });
}

/**
 * Ceiling for every cache lifetime in the app. Tag-based revalidation is the
 * primary way stale data goes away; this is only the backstop for the case
 * where an invalidation is somehow missed.
 */
export const MAX_CACHE_TTL_SECONDS = 24 * 60 * 60; // 1 day

/**
 * Create a response for data that is cached server-side under a cache tag.
 *
 * Deliberately not storable by browsers or the CDN. A response cached via
 * `Cache-Control: public, s-maxage=...` lives in shared caches keyed by URL,
 * where neither `revalidateTag` nor `revalidatePath` can evict it — so admin
 * edits stayed invisible until the entry aged out on its own. The payload is
 * kept cheap by the tagged data cache behind this response instead (see
 * `lib/server/postsData.ts`), which mutations *can* purge, so the database is
 * still spared without anyone being served a deleted post.
 */
export function cachedResponse<T>(data: T): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store, must-revalidate" },
  });
}

// ============================================================================
// Authentication
// ============================================================================

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
}

/**
 * Extract and verify JWT token from request cookies
 * Returns null if not authenticated or token is invalid
 */
export function verifyAuth(request: Request): TokenPayload | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const idx = c.indexOf("=");
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    }),
  );
  const token = cookies["token"];

  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Middleware helper to require authentication
 * Returns an error response if not authenticated, null if authenticated
 */
export function requireAuth(request: Request): NextResponse | null {
  const user = verifyAuth(request);
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }
  return null;
}

/**
 * Middleware helper to require a specific role
 * Returns an error response if not authorized, null if authorized
 */
export function requireRole(
  request: Request,
  allowedRoles: string[],
): NextResponse | null {
  const user = verifyAuth(request);
  if (!user) {
    return errorResponse("Unauthorized", 401);
  }
  if (!allowedRoles.includes(user.role)) {
    return errorResponse("Forbidden", 403);
  }
  return null;
}

// ============================================================================
// Cache Invalidation
// ============================================================================

export const CacheTags = {
  POSTS: "posts",
  HIGHLIGHT: "highlight",
  TEAM: "team",
  PARTNERS: "partners",
} as const;

export type CacheTag = (typeof CacheTags)[keyof typeof CacheTags];

/**
 * Expire tagged entries outright rather than letting them be served stale
 * while they refresh. An admin who just deleted a post has to see it gone on
 * the next read, so the stale-while-revalidate profiles are not usable here.
 */
const IMMEDIATE_EXPIRY = { expire: 0 } as const;

/**
 * Invalidate everything cached under a tag.
 *
 * The API routes are dynamic (`ƒ` in the build output), so they have no route
 * cache of their own — `revalidatePath("/api/posts")` purged nothing. What
 * actually holds the data is the tagged data cache, so purging is by tag.
 * Prerendered *pages* built from the same data still need a path purge.
 */
export function invalidateCache(tag: CacheTag): void {
  revalidateTag(tag, IMMEDIATE_EXPIRY);

  switch (tag) {
    case CacheTags.POSTS:
      // The highlight endpoint INNER JOINs the post tables, so its payload
      // changes whenever a post does — a deleted post would otherwise live on
      // as the highlight.
      revalidateTag(CacheTags.HIGHLIGHT, IMMEDIATE_EXPIRY);
      revalidatePath("/");
      break;
    case CacheTags.HIGHLIGHT:
      revalidatePath("/");
      break;
    case CacheTags.TEAM:
    case CacheTags.PARTNERS:
      break;
  }
}

// ============================================================================
// Request Helpers
// ============================================================================

/**
 * Parse JSON body from request
 */
export async function parseBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

/**
 * Get query parameter from request URL
 */
export function getQueryParam(request: Request, name: string): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get(name);
}

/**
 * Get path parameter (last segment of URL path)
 */
export function getPathId(request: Request): string | null {
  const url = new URL(request.url);
  return url.pathname.split("/").pop() || null;
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Wrap an async handler with error handling
 */
export function withErrorHandling(
  handler: () => Promise<NextResponse>,
  errorMessage = "An error occurred",
): Promise<NextResponse> {
  return handler().catch((error) => {
    console.error(errorMessage, error);
    return errorResponse(errorMessage, 500);
  });
}
