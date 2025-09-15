import { Event } from "@/types";
import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";

export async function GET() {
  console.log("Fetching events from database");
  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Fetch events from the database
    const events = await sql`
      SELECT * FROM events;
    `;

    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  console.log("Creating event in database");

  const sql = neon(process.env.DATABASE_URL!);

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

  try {
    const body: Event = await request.json();

    // Insert a new post into the posts table
    await sql`
      INSERT INTO posts (
        post_uuid,
        created_at
      ) VALUES (
        ${body.uuid},
        ${body.created_at || new Date().toISOString()}
      );
    `;

    // Insert a new event into the events table
    await sql`
      INSERT INTO events (
        created_at,
        updated_at,
        created_by,
        uuid,
        title,
        post_type,
        description,
        display_image,
        images,
        eventLocation,
        dates
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
        ${JSON.stringify(body.dates)}
      );
    `;

    return NextResponse.json(
      { message: "Event created successfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }
}
