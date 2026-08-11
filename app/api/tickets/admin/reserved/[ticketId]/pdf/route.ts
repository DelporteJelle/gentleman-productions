import { getDb, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { loadTicketPdfForReservedSeat } from "@/lib/server/adminReservedSeatPdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  const { ticketId } = await params;
  if (!isUuid(ticketId)) return errorResponse("Reserved seat not found", 404);

  if (!process.env.TICKET_QR_SECRET) {
    console.error("Admin seat PDF rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Ticket issuing is not configured. Contact the site owner.", 503);
  }

  try {
    const sql = getDb();
    const result = await loadTicketPdfForReservedSeat(sql, ticketId);
    if (result.kind === "not_found") return errorResponse("Reserved seat not found", 404);

    return new Response(result.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (err) {
    console.error(`Admin seat PDF failed for ticket ${ticketId}:`, err);
    return errorResponse("Could not generate the ticket PDF.", 500);
  }
}
