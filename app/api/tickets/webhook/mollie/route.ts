import { createMollieClient } from "@mollie/api-client";
import { getDb } from "@/lib/server/api";
import type { Event, Order } from "@/types";

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY! });

export async function POST(request: Request) {
  const form = await request.formData();
  const paymentId = form.get("id") as string | null;
  if (!paymentId) return new Response("No payment ID", { status: 400 });

  const payment = await mollie.payments.get(paymentId);
  const orderId = (payment.metadata as { orderId?: string } | null)?.orderId;
  if (!orderId) return new Response("No order ID in metadata", { status: 400 });

  const sql = getDb();

  if (payment.status === "paid") {
    const orders = await sql`UPDATE orders SET status = 'paid' WHERE id = ${orderId} RETURNING *;`;
    const order = orders[0] as Order | undefined;
    if (!order) return new Response("OK", { status: 200 });

    const soldTickets = await sql`
      UPDATE tickets SET status = 'sold', held_until = NULL
      WHERE order_id = ${orderId}
      RETURNING id, (SELECT "row" FROM seats WHERE seats.id = tickets.seat_id) AS row,
                    (SELECT seat_number FROM seats WHERE seats.id = tickets.seat_id) AS seat_number;
    `;

    const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((d) => d.uuid === order.date_uuid);

    try {
      const { sendTicketEmail } = await import("@/lib/sendTicketEmail");
      await sendTicketEmail({
        order,
        eventName: event?.title ?? "Show",
        startTime: date?.start_time ?? null,
        productionTheme: event?.production_theme ?? null,
        seats: soldTickets.map((t) => ({ id: t.id, row: t.row, seat_number: t.seat_number })),
      });
    } catch (emailErr) {
      console.error("Email send failed:", emailErr);
    }
  } else if (["expired", "canceled", "failed"].includes(payment.status)) {
    await sql`UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL WHERE order_id = ${orderId} AND status = 'held';`;
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${orderId} AND status = 'pending';`;
  }

  return new Response("OK", { status: 200 });
}
