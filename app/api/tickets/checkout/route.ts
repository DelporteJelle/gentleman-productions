import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { eurosToCents } from "@/lib/server/ticketing";
import { getMollie } from "@/lib/server/mollie";
import type { Event } from "@/types";

interface CheckoutBody {
  eventUuid: string; dateUuid: string; ticketIds: string[]; name: string; email: string;
}

export async function POST(request: Request) {
  const sql = getDb();
  const mollie = getMollie();
  try {
    const { eventUuid, dateUuid, ticketIds, name, email } = await parseBody<CheckoutBody>(request);
    if (!eventUuid || !dateUuid || !ticketIds?.length || !name || !email)
      return errorResponse("Missing required fields", 400);

    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
    if (!date || typeof date.price !== "number") return errorResponse("Date not on sale", 404);

    const pricePerSeatCents = eurosToCents(date.price);
    const totalCents = pricePerSeatCents * ticketIds.length;
    const totalEuros = (totalCents / 100).toFixed(2);

    // All requested seats must still be available (treat expired holds as available).
    const rows = (await sql`
      SELECT id, status, held_until FROM tickets
      WHERE id = ANY(${ticketIds}) AND date_uuid = ${dateUuid};
    `) as { id: string; status: string; held_until: string | null }[];
    const now = Date.now();
    const stillFree = (t: { status: string; held_until: string | null }) =>
      t.status === "available" ||
      (t.status === "held" && t.held_until != null && new Date(t.held_until).getTime() < now);
    if (rows.length !== ticketIds.length || !rows.every(stillFree))
      return errorResponse("One or more seats are no longer available.", 409);

    const holdUntil = new Date(now + 10 * 60 * 1000).toISOString();
    await sql`
      UPDATE tickets SET status = 'held', held_until = ${holdUntil}
      WHERE id = ANY(${ticketIds});
    `;

    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${totalCents}, 'pending')
      RETURNING id;
    `;
    const orderId = created[0].id as string;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const isLocal = baseUrl.includes("localhost");

    let payment;
    try {
      payment = await mollie.payments.create({
        amount: { currency: "EUR", value: totalEuros },
        description: `${ticketIds.length} ticket${ticketIds.length > 1 ? "s" : ""} – ${event.title}`,
        redirectUrl: `${baseUrl}/event/${eventUuid}/ticket/${dateUuid}/confirm?order=${orderId}`,
        ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/tickets/webhook/mollie` }),
        metadata: { orderId },
      });
    } catch (mollieErr) {
      await sql`DELETE FROM orders WHERE id = ${orderId};`;
      await sql`UPDATE tickets SET status = 'available', held_until = NULL WHERE id = ANY(${ticketIds});`;
      throw mollieErr;
    }

    await sql`UPDATE orders SET mollie_payment_id = ${payment.id} WHERE id = ${orderId};`;
    await sql`UPDATE tickets SET order_id = ${orderId} WHERE id = ANY(${ticketIds});`;

    return jsonResponse({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error("Checkout error:", err);
    return errorResponse(err instanceof Error ? err.message : "Checkout failed");
  }
}
