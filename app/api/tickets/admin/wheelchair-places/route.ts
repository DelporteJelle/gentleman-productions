import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import {
  validateCreatePlaceInput,
  createWheelchairPlace,
  type CreatePlaceInput,
} from "@/lib/server/wheelchairPlaces";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateCreatePlaceInput(await parseBody<Partial<CreatePlaceInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await createWheelchairPlace(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({
      groupId: result.groupId,
      anchorTicketId: result.anchorTicketId,
      label: result.label,
    });
  } catch (err) {
    // Never echo driver internals back to the browser.
    console.error("Wheelchair place creation failed:", err);
    return errorResponse("Kon de rolstoelplaats niet aanmaken. Probeer opnieuw.", 500);
  }
}
