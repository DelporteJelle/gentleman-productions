import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";

const sql = neon(process.env.DATABASE_URL!);

// GET: Fetch all team members
export async function GET() {
  console.log("Fetching all team members");
  try {
    const teamMembers = await sql`
      SELECT * FROM members;
    `;
    return NextResponse.json(teamMembers);
  } catch (error) {
    console.error("Error fetching team members:", error);
    return NextResponse.json(
      { error: "Failed to fetch team members" },
      { status: 500 },
    );
  }
}

// POST: Create a new team member
export async function POST(request: Request) {
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

  console.log("Creating team member in database");
  try {
    const body = await request.json();

    console.log("Request body:", body);

    // Validate the request body
    if (!body.member_name || !body.member_role) {
      return NextResponse.json(
        { error: "Name and role are required" },
        { status: 400 },
      );
    }

    const newMember = await sql`
      INSERT INTO members (uuid, created_at, member_name, member_role, image, email, linkedin, instagram, facebook, twitter, website)
      VALUES (${body.uuid || crypto.randomUUID()}, ${body.created_at} ,${
        body.member_name
      }, ${body.member_role}, ${body.image_url || null}, ${
        body.email || null
      }, ${body.linkedin || null}, ${body.instagram || null}, ${
        body.facebook || null
      }, ${body.twitter || null}, ${body.website || null})
      RETURNING *;
    `;

    return NextResponse.json(newMember[0], { status: 201 });
  } catch (error) {
    console.error("Error creating team member:", error);
    return NextResponse.json(
      { error: "Failed to create team member" },
      { status: 500 },
    );
  }
}

// PUT: Update an existing team member
export async function PUT(request: Request) {
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

  console.log("Updating team member in database");
  try {
    const body = await request.json();

    // Validate the request body
    if (!body.uuid || !body.member_name || !body.member_role) {
      return NextResponse.json(
        { error: "uuid, name, and role are required" },
        { status: 400 },
      );
    }

    const updatedMember = await sql`
      UPDATE members
      SET 
        member_name = ${body.member_name},
        member_role = ${body.member_role},
        image = ${body.image_url || null},
        email = ${body.email || null},
        linkedin = ${body.linkedin || null},
        instagram = ${body.instagram || null},
        facebook = ${body.facebook || null},
        twitter = ${body.twitter || null},
        website = ${body.website || null},
        updated_at = NOW()
      WHERE uuid = ${body.uuid}
      RETURNING *;
    `;

    if (updatedMember.length === 0) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedMember[0], { status: 200 });
  } catch (error) {
    console.error("Error updating team member:", error);
    return NextResponse.json(
      { error: "Failed to update team member" },
      { status: 500 },
    );
  }
}

// DELETE: Remove a team member
export async function DELETE(request: Request) {
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

  console.log("Deleting team member from database");
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("uuid");

    // Validate the request
    if (!id) {
      return NextResponse.json({ error: "uuid is required" }, { status: 400 });
    }

    const deletedMember = await sql`
      DELETE FROM members
      WHERE uuid = ${id}
      RETURNING *;
    `;

    if (deletedMember.length === 0) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Team member deleted successfully", member: deletedMember[0] },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting team member:", error);
    return NextResponse.json(
      { error: "Failed to delete team member" },
      { status: 500 },
    );
  }
}
