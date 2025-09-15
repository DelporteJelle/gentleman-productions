import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// GET: Fetch the highlight and its linked event from the database
export async function GET() {
  console.log("Fetching highlight");
  try {
    const highlightWithEvent = await sql`
      SELECT Events.*, Highlight.valid_date
      FROM Events
      INNER JOIN Highlight ON Events.uuid = Highlight.event_uuid;
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

export async function DELETE() {
  try {
    // Delete the existing highlight
    await sql`
      DELETE FROM Highlight;
    `;

    return NextResponse.json(
      { message: "Highlight deleted successfully" },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error deleting highlight:", error);
    return NextResponse.json(
      { error: "Failed to delete highlight" },
      { status: 500 },
    );
  }
}

// PUT: Update an existing highlight
export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Validate the request body
    if (!body.event_uuid || !body.valid_date) {
      return NextResponse.json(
        { error: "UUID, event UUID, and valid date are required" },
        { status: 400 },
      );
    }

    // Delete the existing highlight
    await sql`
      DELETE FROM Highlight;
    `;

    // Create a new highlight
    const newHighlight = await sql`
      INSERT INTO Highlight (uuid, event_uuid, valid_date)
      VALUES (${crypto.randomUUID()}, ${body.event_uuid}, ${body.valid_date})
      RETURNING *;
    `;

    return NextResponse.json(newHighlight[0], { status: 200 });
  } catch (error) {
    console.error("Error replacing highlight:", error);
    return NextResponse.json(
      { error: "Failed to replace highlight" },
      { status: 500 },
    );
  }
}
