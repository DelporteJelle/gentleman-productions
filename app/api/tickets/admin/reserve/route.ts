import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import { validateAdminReserveInput, reserveSeatsForAdmin, type AdminReserveInput } from "@/lib/server/adminReservation";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateAdminReserveInput(await parseBody<Partial<AdminReserveInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await reserveSeatsForAdmin(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({ orderId: result.orderId });
  } catch (err) {
    console.error("Admin reserve failed:", err);
    return errorResponse("Could not reserve the selected seats. Please try again.", 500);
  }
}
