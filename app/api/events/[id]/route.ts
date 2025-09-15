
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";

export async function GET(request: Request) {
  console.log("Fetching event from database");
  const sql = neon(process.env.DATABASE_URL!);
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    // Fetch the event from the database
    const event = await sql`
      SELECT * FROM events WHERE uuid = ${id};
    `;

    if (event.length > 0) {
      // Store the fetched event in the cache with a 1-week expiry
      return NextResponse.json(event[0]);
    } else {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
  } catch (error) {
    console.error("Error fetching event:", error);
    return NextResponse.json(
      { error: "Failed to fetch event" },
      { status: 500 },
    );
  }
}


export async function PUT(request: Request) {
  console.log("Updating event in database");
  const sql = neon(process.env.DATABASE_URL!);
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  // Check JWT in cookie
  const cookieHeader = request.headers.get("cookie");
  const token = cookieHeader?.split("token=")[1]?.split(";")[0];
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();

    // Update the entire event entry, overwriting all fields
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

    // Fetch and return the updated event
    const updatedEvent = await sql`
      SELECT * FROM events WHERE uuid = ${id};
    `;

    if (updatedEvent.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(updatedEvent[0]);
  } catch (error) {
    console.error("Error updating event:", error);
    return NextResponse.json(
      { error: "Failed to update event" },
      { status: 500 },
    );
  }
}
