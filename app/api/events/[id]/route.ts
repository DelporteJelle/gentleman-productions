import { Event } from "@/types";
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
    const event = await sql`SELECT * FROM events WHERE uuid = ${id};`;

    if (event.length === 0) {
      return errorResponse("Event not found", 404);
    }

    return jsonResponse(event[0]);
  } catch (error) {
    console.error("Error fetching event:", error);
    return errorResponse("Failed to fetch event");
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
    const body = await parseBody<Event>(request);

    await sql`
      UPDATE events SET
        created_at = ${body.created_at || new Date().toISOString()},
        updated_at = ${new Date().toISOString()},
        created_by = ${body.created_by || null},
        title = ${body.title},
        post_type = ${body.post_type},
        description = ${body.description},
        display_image = ${body.display_image},
        images = ${body.images},
        eventLocation = ${JSON.stringify(body.eventlocation)},
        dates = ${JSON.stringify(body.dates)}
      WHERE uuid = ${id};
    `;

    const updatedEvent = await sql`SELECT * FROM events WHERE uuid = ${id};`;

    if (updatedEvent.length === 0) {
      return errorResponse("Event not found", 404);
    }

    invalidateCache(CacheTags.POSTS);

    return jsonResponse(updatedEvent[0]);
  } catch (error) {
    console.error("Error updating event:", error);
    return errorResponse("Failed to update event");
  }
}
