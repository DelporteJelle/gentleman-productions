import { getDb } from "@/lib/server/api";
import { applyMolliePaymentToOrder } from "@/lib/server/orderFulfillment";

export async function POST(request: Request) {
  const form = await request.formData();
  const paymentId = form.get("id");
  if (typeof paymentId !== "string" || paymentId.length === 0) {
    return new Response("No payment ID", { status: 400 });
  }

  try {
    await applyMolliePaymentToOrder(getDb(), paymentId);
  } catch (err) {
    // A non-2xx makes Mollie retry, which is what we want for transient faults.
    console.error("Mollie webhook failed:", err);
    return new Response("Webhook processing failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
