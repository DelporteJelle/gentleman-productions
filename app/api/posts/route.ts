import { Event } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireRole,
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
    let posts: any[];
    let totalCount: number;

    if (type === "EVENT") {
      // Fetch only events
      const query = sql`
        SELECT 
          posts.created_at AS post_created_at,
          events.*
        FROM posts
        JOIN events ON posts.post_uuid::uuid = events.uuid
        ORDER BY posts.created_at DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;
      posts = await query;

      const total = await sql`SELECT COUNT(*) FROM events;`;
      totalCount = parseInt(total[0].count, 10);
    } else if (type === "BASIC_POST") {
      // Fetch only basic posts
      const query = sql`
        SELECT 
          posts.created_at AS post_created_at,
          basic_posts.*
        FROM posts
        JOIN basic_posts ON posts.post_uuid::uuid = basic_posts.uuid
        ORDER BY posts.created_at DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;
      posts = await query;

      const total = await sql`SELECT COUNT(*) FROM basic_posts;`;
      totalCount = parseInt(total[0].count, 10);
    } else {
      // Fetch both types separately and merge in JS to avoid UNION type mismatches
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

      // Merge and sort by created_at descending
      const allPosts = [...eventRows, ...basicPostRows].sort(
        (a: any, b: any) =>
          new Date(b.post_created_at || b.created_at).getTime() -
          new Date(a.post_created_at || a.created_at).getTime(),
      );

      totalCount = allPosts.length;
      posts = allPosts.slice((page - 1) * limit, page * limit);
    }

    return cachedResponse({
      data: posts,
      total: totalCount,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return errorResponse("Failed to fetch posts");
  }
}

export async function DELETE(request: Request) {
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
  if (authError) return authError;

  const sql = getDb();
  const uuid = getQueryParam(request, "uuid");

  if (!uuid) {
    return errorResponse("Missing 'uuid' parameter", 400);
  }

  try {
    // Delete from both possible tables (only one will match)
    await sql`DELETE FROM events WHERE uuid = ${uuid};`;
    await sql`DELETE FROM basic_posts WHERE uuid = ${uuid};`;
    await sql`DELETE FROM posts WHERE post_uuid = ${uuid};`;
    invalidateCache(CacheTags.POSTS);

    return jsonResponse({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    return errorResponse("Failed to delete post");
  }
}
