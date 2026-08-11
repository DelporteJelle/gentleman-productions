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
import { fetchPostsPage } from "@/lib/server/postsData";

export async function GET(request: Request) {
  const type = getQueryParam(request, "type");
  const page = parseInt(getQueryParam(request, "page") || "1", 10);
  const limit = parseInt(getQueryParam(request, "limit") || "10", 10);

  try {
    // Served from the `posts`-tagged data cache; every post mutation purges
    // that tag, so this cannot outlive the data it describes.
    const { data, total } = await fetchPostsPage(type, page, limit);

    return cachedResponse({
      data,
      total,
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
