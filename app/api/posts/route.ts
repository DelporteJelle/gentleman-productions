import { Event } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireAuth,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";

// Cache for 7 days with tags for manual revalidation
export const revalidate = 604800;

export async function GET(request: Request) {
  const sql = getDb();
  const type = getQueryParam(request, "type");
  const page = parseInt(getQueryParam(request, "page") || "1", 10);
  const limit = parseInt(getQueryParam(request, "limit") || "10", 10);

  try {
    // Base query to fetch events
    let query = sql`
      SELECT 
        posts.created_at AS post_created_at,
        events.*
      FROM posts
      JOIN events ON posts.post_uuid = events.uuid
    `;

    // Apply filter if a specific post_type is provided
    if (type) {
      query = sql`
        ${query}
        WHERE events.post_type = ${type}
      `;
    }

    // Add ordering, pagination, and limits
    query = sql`
      ${query}
      ORDER BY posts.created_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    const posts = await query;

    // Get total count
    const totalQuery = type
      ? sql`SELECT COUNT(*) FROM events WHERE post_type = ${type};`
      : sql`SELECT COUNT(*) FROM events;`;

    const total = await totalQuery;

    return cachedResponse({
      data: posts,
      total: total[0].count,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return errorResponse("Failed to fetch posts");
  }
}

export async function DELETE(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();
  const uuid = getQueryParam(request, "uuid");

  if (!uuid) {
    return errorResponse("Missing 'uuid' parameter", 400);
  }

  try {
    await sql`DELETE FROM posts WHERE post_uuid = ${uuid};`;
    invalidateCache(CacheTags.POSTS);

    return jsonResponse({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    return errorResponse("Failed to delete post");
  }
}
