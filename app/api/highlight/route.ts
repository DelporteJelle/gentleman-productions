import { EventHighlight } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireRole,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";

// Cache for 7 days with tags for manual revalidation
export const revalidate = 604800;

export async function GET() {
  const sql = getDb();

  try {
    // Try to find highlight as an event first
    const highlightWithEvent = await sql`
      SELECT Events.*, Highlight.valid_date
      FROM Events
      INNER JOIN Highlight ON Events.uuid = Highlight.event_uuid;
    `;

    if (highlightWithEvent.length > 0) {
      return cachedResponse(highlightWithEvent);
    }

    // If not found as event, try basic_posts
    const highlightWithBasicPost = await sql`
      SELECT basic_posts.*, Highlight.valid_date
      FROM basic_posts
      INNER JOIN Highlight ON basic_posts.uuid = Highlight.event_uuid;
    `;

    return cachedResponse(highlightWithBasicPost);
  } catch (error) {
    console.error("Error fetching highlight:", error);
    return errorResponse("Failed to fetch highlight");
  }
}

export async function PUT(request: Request) {
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<{ event_uuid: string; valid_date: string }>(request);

    if (!body.event_uuid || !body.valid_date) {
      return errorResponse("Event UUID and valid date are required", 400);
    }

    // Delete existing highlight
    await sql`DELETE FROM Highlight;`;

    // Create new highlight
    await sql`
      INSERT INTO Highlight (uuid, event_uuid, valid_date)
      VALUES (${crypto.randomUUID()}, ${body.event_uuid}, ${body.valid_date})
      RETURNING *;
    `;

    // Fetch the highlight with full event data
    const highlightWithEvent = await sql`
      SELECT Events.*, Highlight.valid_date
      FROM Events
      INNER JOIN Highlight ON Events.uuid = Highlight.event_uuid;
    `;

    invalidateCache(CacheTags.HIGHLIGHT);

    return jsonResponse(highlightWithEvent[0] || null);
  } catch (error) {
    console.error("Error updating highlight:", error);
    return errorResponse("Failed to update highlight");
  }
}

export async function DELETE(request: Request) {
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
  if (authError) return authError;

  const sql = getDb();

  try {
    await sql`DELETE FROM Highlight;`;
    invalidateCache(CacheTags.HIGHLIGHT);

    return jsonResponse({ message: "Highlight deleted successfully" });
  } catch (error) {
    console.error("Error deleting highlight:", error);
    return errorResponse("Failed to delete highlight");
  }
}
