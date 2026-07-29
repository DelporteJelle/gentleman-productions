import { getDb, jsonResponse, errorResponse, requireRole } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import type { Event, Order } from "@/types";

/**
 * Admin-only ticket re-issue.
 *
 * Signing the QR payload removed the old manual recovery path (the ticket id
 * used to *be* the credential, so an operator could re-render a QR by hand).
 * This replaces it: it re-derives everything from the database and re-uses
 * `sendTicketEmail`, so a re-sent ticket is byte-for-byte the one fulfilment
 * would have produced — including a freshly signed token, which is what makes
 * this the mechanism SECURITY.md's "re-send after rotating TICKET_QR_SECRET"
 * instruction depends on.
 *
 * It reads and re-sends only. It never marks anything paid or sold, so it is
 * safe to call repeatedly; the only side effect is another email.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;

  // Same fail-closed rule as checkout and scan: without the secret every
  // re-issued QR would be unsignable (or signed with the wrong key and
  // rejected at the door). Say so plainly rather than returning an opaque 500.
  if (!process.env.TICKET_QR_SECRET) {
    console.error("Ticket resend rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Ticket issuing is not configured. Contact the site owner.", 503);
  }

  const { id } = await params;
  // `orders.id` is a `uuid` column — a malformed value would raise a driver
  // error, so reject it as "not found" instead.
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const sql = getDb();
  try {
    const orderRows = await sql`SELECT * FROM orders WHERE id = ${id};`;
    const order = orderRows[0] as Order | undefined;
    if (!order) return errorResponse("Order not found", 404);

    if (order.status !== "paid") {
      return errorResponse(
        `Order is ${order.status}, not paid — there are no tickets to re-send.`,
        409,
      );
    }

    // Read the authoritative sold set rather than trusting the order total:
    // an order can be paid and still hold no seats (fulfilment lost them), and
    // that case needs a human, not a ticketless email.
    const soldTickets = await sql`
      SELECT t.id, s."row" AS row, s.seat_number AS seat_number
      FROM tickets t JOIN seats s ON s.id = t.seat_id
      WHERE t.order_id = ${id} AND t.status = 'sold';
    `;
    if (soldTickets.length === 0) {
      return errorResponse(
        "Order is paid but holds no sold tickets — this needs a refund or a reseat, not a re-send.",
        409,
      );
    }

    const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((d) => d.uuid === order.date_uuid);

    // Imported lazily for the same reason orderFulfillment.ts does: the module
    // constructs `new Resend(process.env.RESEND_API_KEY)` at module scope,
    // which THROWS when the key is absent. Loading it here keeps that throw
    // inside the catch below instead of failing the whole route at import.
    const { sendTicketEmail } = await import("@/lib/sendTicketEmail");
    await sendTicketEmail({
      order,
      eventName: event?.title ?? "Show",
      startTime: date?.start_time ?? null,
      productionTheme: event?.production_theme ?? null,
      seats: soldTickets.map((t) => ({
        ticketId: t.id,
        row: t.row,
        seat_number: t.seat_number,
      })),
    });

    console.info(`Re-sent ${soldTickets.length} ticket(s) for order ${id}`);
    return jsonResponse({ resent: soldTickets.length, email: order.customer_email });
  } catch (err) {
    console.error(`Ticket resend failed for order ${id}:`, err);
    return errorResponse("Could not re-send the tickets. Check the server logs.", 500);
  }
}
