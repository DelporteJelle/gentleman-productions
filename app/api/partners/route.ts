import { Partner } from "@/types";
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";

export async function GET() {
  const sql = getDb();

  try {
    const partners = await sql`SELECT * FROM partners;`;
    return jsonResponse(partners);
  } catch (error) {
    console.error("Error fetching partners:", error);
    return errorResponse("Failed to fetch partners");
  }
}

export async function POST(request: Request) {
  console.log(request.headers.get("cookie"));
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<Partner>(request);

    if (!body.partner_name) {
      return errorResponse("Partner name is required", 400);
    }

    const newPartner = await sql`
      INSERT INTO partners (
        uuid, created_at, partner_name, description, logo
      ) VALUES (
        ${body.uuid || crypto.randomUUID()},
        ${body.created_at || new Date().toISOString()},
        ${body.partner_name},
        ${body.description || null},
        ${body.logo || null}
      )
      RETURNING *;
    `;

    invalidateCache(CacheTags.PARTNERS);

    return jsonResponse(newPartner[0], 201);
  } catch (error) {
    console.error("Error creating partner:", error);
    return errorResponse("Failed to create partner");
  }
}

export async function PUT(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<Partner>(request);

    if (!body.uuid || !body.partner_name) {
      return errorResponse("UUID and partner name are required", 400);
    }

    const updatedPartner = await sql`
      UPDATE partners SET
        partner_name = ${body.partner_name},
        description = ${body.description || null},
        logo = ${body.logo || null},
        updated_at = NOW()
      WHERE uuid = ${body.uuid}
      RETURNING *;
    `;

    if (updatedPartner.length === 0) {
      return errorResponse("Partner not found", 404);
    }

    invalidateCache(CacheTags.PARTNERS);

    return jsonResponse(updatedPartner[0]);
  } catch (error) {
    console.error("Error updating partner:", error);
    return errorResponse("Failed to update partner");
  }
}

export async function DELETE(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();
  const uuid = getQueryParam(request, "uuid");

  if (!uuid) {
    return errorResponse("UUID is required", 400);
  }

  try {
    const deletedPartner = await sql`
      DELETE FROM partners WHERE uuid = ${uuid} RETURNING *;
    `;

    if (deletedPartner.length === 0) {
      return errorResponse("Partner not found", 404);
    }

    invalidateCache(CacheTags.PARTNERS);

    return jsonResponse({
      message: "Partner deleted successfully",
      partner: deletedPartner[0],
    });
  } catch (error) {
    console.error("Error deleting partner:", error);
    return errorResponse("Failed to delete partner");
  }
}
