import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import jwt from "jsonwebtoken";
const sql = neon(process.env.DATABASE_URL!);

// GET: Fetch all partners
export async function GET() {
  console.log("Fetching all partners");
  try {
    const partners = await sql`
      SELECT * FROM partners;
    `;
    return NextResponse.json(partners);
  } catch (error) {
    console.error("Error fetching partners:", error);
    return NextResponse.json(
      { error: "Failed to fetch partners" },
      { status: 500 },
    );
  }
}

// POST: Create a new partner
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

  console.log("Creating partner in database");
  try {
    const body = await request.json();

    // Validate the request body
    if (!body.partner_name || !body.logo || !body.description) {
      return NextResponse.json(
        { error: "Partner name, logo, and description are required" },
        { status: 400 },
      );
    }

    const newPartner = await sql`
      INSERT INTO partners (
        uuid,
        created_at,
        updated_at,
        created_by,
        partner_name,
        logo,
        description
      ) VALUES (
        gen_random_uuid(),
        NOW(),
        NULL,
        ${body.created_by || null},
        ${body.partner_name},
        ${body.logo},
        ${body.description}
      )
      RETURNING *;
    `;

    return NextResponse.json(newPartner[0], { status: 201 });
  } catch (error) {
    console.error("Error creating partner:", error);
    return NextResponse.json(
      { error: "Failed to create partner" },
      { status: 500 },
    );
  }
}

// PUT: Update an existing partner
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

  console.log("Updating partner in database");
  try {
    const body = await request.json();

    // Validate the request body
    if (!body.uuid || !body.partner_name || !body.logo || !body.description) {
      return NextResponse.json(
        { error: "UUID, partner name, logo, and description are required" },
        { status: 400 },
      );
    }

    const updatedPartner = await sql`
      UPDATE partners
      SET 
        partner_name = ${body.partner_name},
        logo = ${body.logo},
        description = ${body.description},
        updated_at = NOW(),
        created_by = ${body.created_by || null}
      WHERE uuid = ${body.uuid}
      RETURNING *;
    `;

    if (updatedPartner.length === 0) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json(updatedPartner[0], { status: 200 });
  } catch (error) {
    console.error("Error updating partner:", error);
    return NextResponse.json(
      { error: "Failed to update partner" },
      { status: 500 },
    );
  }
}

// DELETE: Remove a partner
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

  console.log("Deleting partner from database");
  try {
    const { searchParams } = new URL(request.url);
    const uuid = searchParams.get("uuid");

    // Validate the request
    if (!uuid) {
      return NextResponse.json({ error: "UUID is required" }, { status: 400 });
    }

    const deletedPartner = await sql`
      DELETE FROM partners
      WHERE uuid = ${uuid}
      RETURNING *;
    `;

    if (deletedPartner.length === 0) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Partner deleted successfully", partner: deletedPartner[0] },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error deleting partner:", error);
    return NextResponse.json(
      { error: "Failed to delete partner" },
      { status: 500 },
    );
  }
}
