import { TeamMember } from "@/types";
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
    const teamMembers = await sql`SELECT * FROM members;`;
    return jsonResponse(teamMembers);
  } catch (error) {
    console.error("Error fetching team members:", error);
    return errorResponse("Failed to fetch team members");
  }
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<TeamMember>(request);

    if (!body.member_name || !body.member_role) {
      return errorResponse("Name and role are required", 400);
    }

    const newMember = await sql`
      INSERT INTO members (
        uuid, created_at, member_name, member_role, image,
        email, linkedin, instagram, facebook, twitter, website
      ) VALUES (
        ${body.uuid || crypto.randomUUID()},
        ${body.created_at || new Date().toISOString()},
        ${body.member_name},
        ${body.member_role},
        ${body.image || null},
        ${body.email || null},
        ${body.linkedin || null},
        ${body.instagram || null},
        ${body.facebook || null},
        ${body.twitter || null},
        ${body.website || null}
      )
      RETURNING *;
    `;

    invalidateCache(CacheTags.TEAM);

    return jsonResponse(newMember[0], 201);
  } catch (error) {
    console.error("Error creating team member:", error);
    return errorResponse("Failed to create team member");
  }
}

export async function PUT(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const sql = getDb();

  try {
    const body = await parseBody<TeamMember>(request);

    if (!body.uuid || !body.member_name || !body.member_role) {
      return errorResponse("UUID, name, and role are required", 400);
    }

    const updatedMember = await sql`
      UPDATE members SET
        member_name = ${body.member_name},
        member_role = ${body.member_role},
        image = ${body.image || null},
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
      return errorResponse("Team member not found", 404);
    }

    invalidateCache(CacheTags.TEAM);

    return jsonResponse(updatedMember[0]);
  } catch (error) {
    console.error("Error updating team member:", error);
    return errorResponse("Failed to update team member");
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
    const deletedMember = await sql`
      DELETE FROM members WHERE uuid = ${uuid} RETURNING *;
    `;

    if (deletedMember.length === 0) {
      return errorResponse("Team member not found", 404);
    }

    invalidateCache(CacheTags.TEAM);

    return jsonResponse({
      message: "Team member deleted successfully",
      member: deletedMember[0],
    });
  } catch (error) {
    console.error("Error deleting team member:", error);
    return errorResponse("Failed to delete team member");
  }
}
