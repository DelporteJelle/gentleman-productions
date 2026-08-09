import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { revokeCode } from "@/lib/server/ticketCodes";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Code niet gevonden", 404);

  try {
    const revoked = await revokeCode(getDb(), id);
    if (!revoked) return errorResponse("Deze code is al gebruikt of al ingetrokken.", 409);
    return jsonResponse({ revoked: true });
  } catch (err) {
    console.error(`Revoking code ${id} failed:`, err);
    return errorResponse("Kon de code niet intrekken. Probeer opnieuw.", 500);
  }
}
