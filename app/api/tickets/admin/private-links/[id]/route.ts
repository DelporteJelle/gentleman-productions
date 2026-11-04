import { errorResponse, getDb, jsonResponse, requireRole } from "@/lib/server/api";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;
  const { id } = await params;
  try {
    const rows = await getDb()`
      UPDATE private_ticket_links
         SET token_hash = NULL, revoked_at = now()
       WHERE id = ${id}
       RETURNING id, event_uuid, date_uuid, created_at, expires_at, revoked_at,
                 ticket_limit, allocated_tickets;
    `;
    if (!rows.length) return errorResponse("Private link not found.", 404);
    return jsonResponse({ link: { ...rows[0], active: false } }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Private ticket link revocation failed:", error);
    return errorResponse("Could not revoke private ticket link.");
  }
}
