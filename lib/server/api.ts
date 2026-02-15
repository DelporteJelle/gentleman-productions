/**
 * Server-side API utilities for Next.js API routes.
 * Provides consistent response handling, authentication, and database access.
 */

import { NextResponse } from "next/server";
import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";

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
 * Create a cached response with standard cache headers
 */
export function cachedResponse<T>(
  data: T,
  maxAge = 604800, // 7 days default
  staleWhileRevalidate = 86400, // 1 day default
): NextResponse {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    },
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
  const token = cookieHeader?.split("token=")[1]?.split(";")[0];

  if (!token) {
    return null;
  }

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
 * Invalidate a cache tag
 */
export function invalidateCache(tag: CacheTag): void {
  // Cache invalidation handled by Next.js 16+ automatically
  // revalidateTag can be called from route handlers if needed
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
