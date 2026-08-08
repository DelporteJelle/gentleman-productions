import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { revertWheelchairPlace } from "@/lib/server/wheelchairPlaces";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { groupId } = await params;
  // wheelchair_group_id is a Postgres uuid column, so a malformed value reaches
  // the driver and raises `invalid input syntax for type uuid` — a generic 500
  // where the caller deserves a clean rejection.
  if (!isUuid(groupId)) return errorResponse("Rolstoelplaats niet gevonden", 404);

  try {
    const sql = getDb();
    const result = await revertWheelchairPlace(sql, groupId);
    if (!result.ok) return errorResponse(result.error, result.status);
    return jsonResponse({ reverted: true, released: result.released });
  } catch (err) {
    console.error(`Wheelchair place revert failed for group ${groupId}:`, err);
    return errorResponse("Kon de rolstoelplaats niet terugzetten. Probeer opnieuw.", 500);
  }
}
