import { BasicPost } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";

export async function GET() {
  const sql = getDb();

  try {
    const basicPosts = await sql`SELECT * FROM basic_posts;`;
    return jsonResponse(basicPosts);
  } catch (error) {
    console.error("Error fetching basic posts:", error);
    return errorResponse("Failed to fetch basic posts");
  }
}

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<BasicPost>(request);

    // Insert into posts table
    await sql`
      INSERT INTO posts (post_uuid, created_at)
      VALUES (${body.uuid}, ${body.created_at || new Date().toISOString()});
    `;

    // Insert into basic_posts table
    const createdPost = await sql`
      INSERT INTO basic_posts (
        created_at, updated_at, created_by, uuid, title,
        post_type, description, display_image, link, link_text,
        date, location
      ) VALUES (
        ${body.created_at || new Date().toISOString()},
        ${body.updated_at || null},
        ${body.created_by || null},
        ${body.uuid},
        ${body.title},
        ${body.post_type},
        ${body.description || ""},
        ${body.display_image},
        ${body.link || null},
        ${body.link_text || null},
        ${body.date || null},
        ${body.location || null}
      )
      RETURNING *;
    `;

    invalidateCache(CacheTags.POSTS);

    return jsonResponse(createdPost[0], 201);
  } catch (error) {
    console.error("Error creating basic post:", error);
    return errorResponse("Failed to create basic post");
  }
}
