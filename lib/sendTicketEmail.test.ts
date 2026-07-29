import { describe, it, expect, vi, beforeAll } from "vitest";

// sendTicketEmail constructs `new Resend(...)` at module scope and calls
// resend.emails.send(...) directly, so both the network client and the PDF
// renderer are mocked here. No real email is ever sent by this test — the
// only thing under test is the HTML-escaping wired into the template, which
// is not part of either mock.
const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ data: { id: "email_test_1" }, error: null }),
  generateTicketPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mocks.send },
  })),
}));

vi.mock("@/lib/generateTicketPdf", () => ({
  generateTicketPdf: mocks.generateTicketPdf,
}));

import { sendTicketEmail } from "@/lib/sendTicketEmail";
import type { Order } from "@/types";

const HOSTILE_NAME = `<b>Ada</b> & "Friends"`;

function makeOrder(overrides?: Partial<Order>): Order {
  return {
    id: "order-1",
    event_uuid: "event-1",
    date_uuid: "date-1",
    customer_name: HOSTILE_NAME,
    customer_email: "ada@example.com",
    total_amount: 4000,
    status: "paid",
    mollie_payment_id: "tr_test_123",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("sendTicketEmail", () => {
  beforeAll(() => {
    process.env.TICKET_QR_SECRET = "test-secret-not-used-in-production";
    process.env.RESEND_FROM = "tickets@example.test";
  });

  it("HTML-escapes attacker-controlled values in the body but leaves the subject header raw", async () => {
    const order = makeOrder();

    await sendTicketEmail({
      order,
      eventName: "Rock & Roll Cabaret",
      startTime: "2026-08-01T19:00:00Z",
      productionTheme: null,
      seats: [{ id: "seat-1", row: "A", seat_number: 1 }],
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload = mocks.send.mock.calls[0][0];

    // customer_name — the finding's primary attack vector.
    expect(payload.html).toContain("&lt;b&gt;Ada&lt;/b&gt; &amp; &quot;Friends&quot;");
    expect(payload.html).not.toContain("<b>Ada</b>");

    // eventName is a second interpolation in the same body and must be
    // escaped too — a fix that only special-cases customer_name would miss it.
    expect(payload.html).toContain("Rock &amp; Roll Cabaret");
    expect(payload.html).not.toContain("Rock & Roll Cabaret");

    // The subject is an email header, not HTML: it must keep the raw
    // eventName, not the escaped one, or literal "&amp;" would show up in
    // people's inboxes.
    expect(payload.subject).toContain("Rock & Roll Cabaret");
    expect(payload.subject).not.toContain("Rock &amp; Roll Cabaret");

    // PDFs still attach, one per seat, unaffected by the escaping change.
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("Ticket-A1.pdf");
    expect(mocks.generateTicketPdf).toHaveBeenCalledTimes(1);
  });
});
