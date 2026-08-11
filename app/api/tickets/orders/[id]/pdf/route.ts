import { getDb, errorResponse } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { loadTicketsPdfForOrder } from "@/lib/server/ticketPdfForOrder";

/**
 * Backup delivery path for tickets whose confirmation email failed to
 * arrive. Guarded the same way the confirm page's status poll already is —
 * by possession of the order UUID — because this URL grants no more than
 * forwarding the confirmation email already would. See
 * docs/superpowers/specs/2026-07-29-ticket-pdf-download-design.md.
 *
 * Unlike the status poll, this route mints working door QR codes on every
 * call, so it is rate-limited per IP on top of the UUID's unguessability.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`pdf:${clientIp}`, 30, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return errorResponse("Too many download attempts. Please try again later.", 429);
  }

  // Same fail-closed rule as checkout/resend: without the secret, no QR can
  // be (re)signed, so refuse rather than hand back a PDF with a dead code.
  if (!process.env.TICKET_QR_SECRET) {
    console.error("Ticket PDF download rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Ticket issuing is not configured. Contact the site owner.", 503);
  }

  const sql = getDb();
  try {
    const result = await loadTicketsPdfForOrder(sql, id);

    switch (result.kind) {
      case "not_found":
        return errorResponse("Order not found", 404);
      case "not_paid":
        return errorResponse(`Order is ${result.status}, not paid — there are no tickets to download.`, 409);
      case "no_tickets":
        return errorResponse("Order is paid but holds no sold tickets — this needs a refund or a reseat, not a download.", 409);
      case "ok":
        return new Response(result.buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${result.filename}"`,
            "Cache-Control": "no-store",
          },
        });
    }
  } catch (err) {
    console.error(`Ticket PDF download failed for order ${id}:`, err);
    return errorResponse("Could not generate your tickets. Check the server logs.", 500);
  }
}
