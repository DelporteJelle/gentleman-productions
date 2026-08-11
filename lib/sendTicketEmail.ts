import { Resend } from "resend";
import { generateTicketPdf } from "./generateTicketPdf";
import { signTicketToken } from "./server/ticketToken";
import { escapeHtml } from "./text";
import type { Order, ProductionTheme } from "@/types";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendTicketEmail({
  order,
  eventName,
  startTime,
  location,
  productionTheme,
  seats,
}: {
  order: Order;
  eventName: string;
  startTime: string | null;
  /** Venue label, e.g. `event.eventlocation?.location || event.eventlocation?.city`. */
  location: string | null;
  productionTheme: ProductionTheme | null;
  /**
   * `ticketId` is `tickets.id`, NOT `seats.id`: it is the value the QR code is
   * signed over and the door scanner looks up. Passing a seat id here would
   * sign and render perfectly and then fail at the door with "Ticket not
   * found", which is only discoverable on show night.
   */
  seats: { ticketId: string; row: string; seat_number: number }[];
}): Promise<void> {
  const d = startTime ? new Date(startTime) : null;
  const date = d
    ? d.toLocaleDateString("nl-BE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const time = d ? d.toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : "";

  // Generate one styled PDF per ticket
  const attachments = await Promise.all(
    seats.map(async (seat) => {
      const seatLabel = `${seat.row}${seat.seat_number}`;
      const pdfBuffer = await generateTicketPdf({
        seatLabel,
        qrPayload: signTicketToken(seat.ticketId),
        eventName,
        date,
        time,
        productionTheme,
      });
      return {
        filename: `Ticket-${seatLabel}.pdf`,
        content: pdfBuffer,
      };
    })
  );

  const seatList = seats.map((s) => `${s.row}${s.seat_number}`).join(", ");

  // Everything below is interpolated into HTML; customer_name in particular is
  // free-form input from the checkout form.
  const safeName = escapeHtml(order.customer_name);
  const safeEventName = escapeHtml(eventName);
  const safeSeatList = escapeHtml(seatList);
  const safeDate = escapeHtml(date);
  const safeTime = escapeHtml(time);
  const safeLocation = location ? escapeHtml(location) : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:48px 20px;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0">

              <!-- Header -->
              <tr>
                <td style="text-align:center;padding-bottom:36px;">
                  <p style="margin:0 0 12px;color:#c9a84c;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;">◆</p>
                  <h1 style="margin:0 0 10px;color:#f5f5f5;font-family:Georgia,serif;font-size:30px;font-weight:normal;">Je tickets zijn bevestigd</h1>
                  <p style="margin:0;color:#888;font-size:14px;line-height:1.6;">Hey ${safeName}, je plaatsen zijn gereserveerd.<br>Tot dan!</p>
                </td>
              </tr>

              <!-- Summary card -->
              <tr>
                <td style="background:#0a0a0a;border:1px solid #2a2a2a;border-radius:10px;padding:24px 28px;">
                  <p style="margin:0 0 4px;color:#c9a84c;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">Gentleman Productions</p>
                  <p style="margin:0 0 6px;color:#f5f5f5;font-family:Georgia,serif;font-size:22px;font-weight:normal;">${safeEventName}</p>
                  <p style="margin:0 0 20px;color:#888;font-size:13px;">${safeDate} &nbsp;·&nbsp; ${safeTime}${safeLocation ? ` &nbsp;·&nbsp; ${safeLocation}` : ""}</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a2a;padding-top:16px;">
                    <tr>
                      <td>
                        <p style="margin:0 0 4px;color:#888;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Plaatsen</p>
                        <p style="margin:0;color:#c9a84c;font-family:Georgia,serif;font-size:20px;">${safeSeatList}</p>
                      </td>
                      <td style="text-align:right;">
                        <p style="margin:0 0 4px;color:#888;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Tickets</p>
                        <p style="margin:0;color:#f5f5f5;font-family:Georgia,serif;font-size:20px;">${seats.length}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Instruction -->
              <tr>
                <td style="padding:28px 0 0;text-align:center;">
                  <p style="margin:0;color:#888;font-size:13px;line-height:1.7;">Je tickets zitten als PDF-bestand in de bijlage.<br>Open elk bestand en toon de QR-code aan de deur.</p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="text-align:center;padding:36px 0 0;border-top:1px solid #2a2a2a;margin-top:36px;">
                  <p style="margin:4px 0;color:#444;font-size:11px;">Gentleman Productions · Merelbeke, België</p>
                  <p style="margin:4px 0;color:#444;font-size:11px;">gentlemanproductions.be</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await resend.emails.send({
    from: process.env.RESEND_FROM!,
    to: order.customer_email,
    subject: `Je tickets voor ${eventName} – ${date}`,
    html,
    attachments,
  });
}
