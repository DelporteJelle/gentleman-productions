import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

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
