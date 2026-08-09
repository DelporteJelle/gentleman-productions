import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
import {
  validateSeatToggleInput,
  enableSeats,
  type SeatToggleInput,
} from "@/lib/server/seatAvailability";

export async function POST(request: Request) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  try {
    const parsed = validateSeatToggleInput(await parseBody<Partial<SeatToggleInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const sql = getDb();
    const result = await enableSeats(sql, parsed.value);
    if (!result.ok) return errorResponse(result.error, result.status);

    return jsonResponse({ changed: result.changed });
  } catch (err) {
    // Never echo driver internals back to the browser.
    console.error("Enabling seats failed:", err);
    return errorResponse("Kon de stoelen niet inschakelen. Probeer opnieuw.", 500);
  }
}
