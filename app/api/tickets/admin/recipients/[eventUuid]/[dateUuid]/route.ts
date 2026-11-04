import { errorResponse, getDb, jsonResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventUuid: string; dateUuid: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { eventUuid, dateUuid } = await params;
  if (!isUuid(eventUuid) || !isUuid(dateUuid)) {
    return errorResponse("Invalid event date.", 400);
  }

  try {
    const rows = await getDb()`
      SELECT DISTINCT customer_email
      FROM orders
      WHERE event_uuid = ${eventUuid}
        AND date_uuid = ${dateUuid}
        AND status = 'paid'
        AND reserved_by_admin = false
      ORDER BY customer_email;
    `;

    return jsonResponse({ emails: rows.map((row) => row.customer_email as string) });
  } catch (err) {
    console.error("Loading ticket buyer email addresses failed:", err);
    return errorResponse("Could not load ticket buyer email addresses.", 500);
  }
}
