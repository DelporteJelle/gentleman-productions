import { Event } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  getPathId,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
import { provisionTicketsForEvent } from "@/lib/server/ticketing";

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
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
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
        dates = ${JSON.stringify(body.dates)},
        tickets_open = ${body.tickets_open ?? false},
        production_theme = ${body.production_theme ? JSON.stringify(body.production_theme) : null}
      WHERE uuid = ${id};
    `;

    const updatedEvent = await sql`SELECT * FROM events WHERE uuid = ${id};`;

    if (updatedEvent.length === 0) {
      return errorResponse("Event not found", 404);
    }

    await provisionTicketsForEvent(sql, { ...body, uuid: id });
    invalidateCache(CacheTags.POSTS);

    return jsonResponse(updatedEvent[0]);
  } catch (error) {
    console.error("Error updating event:", error);
    return errorResponse("Failed to update event");
  }
}
