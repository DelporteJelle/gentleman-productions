import { EventHighlight } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireAuth,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";

// Cache for 7 days with tags for manual revalidation
export const revalidate = 604800;

export async function GET() {
  const sql = getDb();

  try {
    const highlightWithEvent = await sql`
      SELECT Events.*, Highlight.valid_date
      FROM Events
      INNER JOIN Highlight ON Events.uuid = Highlight.event_uuid;
    `;

    return cachedResponse(highlightWithEvent);
  } catch (error) {
    console.error("Error fetching highlight:", error);
    return errorResponse("Failed to fetch highlight");
  }
}

export async function PUT(request: Request) {
  const authError = requireAuth(request);
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
  const authError = requireAuth(request);
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
