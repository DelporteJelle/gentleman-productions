import { BasicPost } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  getPathId,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";

export async function GET(request: Request) {
  const sql = getDb();
  const id = getPathId(request);

  if (!id) {
    return errorResponse("ID is required", 400);
  }

  try {
    const post = await sql`SELECT * FROM basic_posts WHERE uuid = ${id};`;

    if (post.length === 0) {
      return errorResponse("Basic post not found", 404);
    }

    return jsonResponse(post[0]);
  } catch (error) {
    console.error("Error fetching basic post:", error);
    return errorResponse("Failed to fetch basic post");
  }
}

export async function PUT(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();
  const id = getPathId(request);

  if (!id) {
    return errorResponse("ID is required", 400);
  }

  try {
    const body = await parseBody<BasicPost>(request);

    await sql`
      UPDATE basic_posts SET
        updated_at = ${new Date().toISOString()},
        title = ${body.title},
        description = ${body.description || ""},
        display_image = ${body.display_image},
        link = ${body.link || null},
        link_text = ${body.link_text || null},
        date = ${body.date || null},
        location = ${body.location || null}
      WHERE uuid = ${id};
    `;

    const updatedPost = await sql`SELECT * FROM basic_posts WHERE uuid = ${id};`;

    if (updatedPost.length === 0) {
      return errorResponse("Basic post not found", 404);
    }

    invalidateCache(CacheTags.POSTS);

    return jsonResponse(updatedPost[0]);
  } catch (error) {
    console.error("Error updating basic post:", error);
    return errorResponse("Failed to update basic post");
  }
}
