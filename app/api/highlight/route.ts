import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// GET: Fetch the highlight and its linked event from the database
export async function GET() {
  console.log("Fetching highlight");
  try {
    const highlightWithEvent = await sql`
      SELECT 
        Highlight.uuid AS highlight_uuid,
        Highlight.valid_date,
        Events.uuid AS event_uuid,
        Events.title,
        Events.description,
        Events.display_image,
        Events.eventLocation,
        Events.dates
      FROM Highlight
      JOIN Events ON Highlight.event_uuid = Events.uuid;
    `;
    return NextResponse.json(highlightWithEvent);
  } catch (error) {
    console.error("Error fetching highlight with event:", error);
    return NextResponse.json(
      { error: "Failed to fetch highlight with event" },
      { status: 500 },
    );
  }
}

// PUT: Update an existing highlight
export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Validate the request body
    if (!body.uuid || !body.event_uuid || !body.valid_date) {
      return NextResponse.json(
        { error: "UUID, event UUID, and valid date are required" },
        { status: 400 },
      );
    }

    const updatedHighlight = await sql`
      UPDATE Highlight
      SET 
        event_uuid = ${body.event_uuid},
        valid_date = ${body.valid_date}
      WHERE uuid = ${body.uuid}
      RETURNING *;
    `;

    if (updatedHighlight.length === 0) {
      return NextResponse.json(
        { error: "Highlight not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedHighlight[0], { status: 200 });
  } catch (error) {
    console.error("Error updating highlight:", error);
    return NextResponse.json(
      { error: "Failed to update highlight" },
      { status: 500 },
    );
  }
}
