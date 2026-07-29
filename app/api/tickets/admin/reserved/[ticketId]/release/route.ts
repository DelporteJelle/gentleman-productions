import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { releaseAdminReservedSeat } from "@/lib/server/adminReservation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { ticketId } = await params;
  if (!isUuid(ticketId)) return errorResponse("Reserved seat not found", 404);

  try {
    const sql = getDb();
    const result = await releaseAdminReservedSeat(sql, ticketId);
    if (!result.ok) return errorResponse(result.error, result.status);
    return jsonResponse({ released: true });
  } catch (err) {
    console.error(`Release failed for ticket ${ticketId}:`, err);
    return errorResponse("Could not release this seat. Please try again.", 500);
  }
}
