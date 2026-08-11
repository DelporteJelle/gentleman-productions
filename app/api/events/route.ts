import { Event } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
import { provisionTicketsForEvent } from "@/lib/server/ticketing";

export async function GET() {
  const sql = getDb();

  try {
    const events = await sql`SELECT * FROM events;`;
    return jsonResponse(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return errorResponse("Failed to fetch events");
  }
}

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<Event>(request);

    // Insert into posts table
    await sql`
      INSERT INTO posts (post_uuid, created_at)
      VALUES (${body.uuid}, ${body.created_at || new Date().toISOString()});
    `;

    // Insert into events table
    const createdEvent = await sql`
      INSERT INTO events (
        created_at, updated_at, created_by, uuid, title,
        post_type, description, display_image, images,
        eventLocation, dates, tickets_open, production_theme
      ) VALUES (
        ${body.created_at || new Date().toISOString()},
        ${body.updated_at || null},
        ${body.created_by || null},
        ${body.uuid},
        ${body.title},
        ${body.post_type},
        ${body.description},
        ${body.display_image},
        ${body.images},
        ${JSON.stringify(body.eventlocation)},
        ${JSON.stringify(body.dates)},
        ${body.tickets_open ?? false},
        ${body.production_theme ? JSON.stringify(body.production_theme) : null}
      )
      RETURNING *;
    `;

    await provisionTicketsForEvent(sql, body);
    invalidateCache(CacheTags.POSTS);
    return jsonResponse(createdEvent[0], 201);
  } catch (error) {
    console.error("Error creating event:", error);
    return errorResponse("Failed to create event");
  }
}
