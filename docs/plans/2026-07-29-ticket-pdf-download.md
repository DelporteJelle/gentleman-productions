# Ticket PDF Download on Confirmation Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `executing-plans` (single-session, task-by-task) or `subagent-driven-development` (multi-agent, parallel-safe tasks) to implement. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Let a customer download their paid tickets as a single multi-page PDF from the confirmation page, as a backup to the Resend email.

**Architecture:** A new `GET /api/tickets/orders/[id]/pdf` route re-derives the ticket PDF from the database on every request (no storage), reusing the order-UUID-only trust model the confirm page's existing status-poll endpoint already relies on. The route delegates its DB-reading/branching logic to a new testable helper, `lib/server/ticketPdfForOrder.ts`, mirroring how `applyMolliePaymentToOrder` and `validateCheckoutInput` already separate business logic from route wiring in this codebase. PDF rendering itself extends the existing `lib/generateTicketPdf.ts` with a multi-page variant that shares the current single-ticket page-drawing code.

**Tech Stack:** Next.js App Router route handlers, `pdfkit` + `qrcode` (already dependencies), `@neondatabase/serverless`, Vitest.

**Affected areas:** `lib/generateTicketPdf.ts`, new `lib/server/ticketPdfForOrder.ts`, new `app/api/tickets/orders/[id]/pdf/route.ts`, `app/event/[id]/ticket/[dateId]/confirm/page.tsx`.

**Base branch:** current branch (`dev`), per this repo's normal workflow — no branch-name conventions doc exists here, follow whatever branch is checked out.

**Design doc:** [docs/superpowers/specs/2026-07-29-ticket-pdf-download-design.md](../superpowers/specs/2026-07-29-ticket-pdf-download-design.md) — read this first for the *why* behind the access model and the on-demand-generation choice (Approach A vs. B vs. C).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/generateTicketPdf.ts` | Modify | Extract per-page drawing into an internal function; add `generateTicketsPdf()` for multi-page output. `generateTicketPdf()` keeps its existing signature/behavior. |
| `lib/generateTicketPdf.test.ts` | Create | Assert `generateTicketsPdf` emits one page per seat. |
| `lib/server/ticketPdfForOrder.ts` | Create | Pure-ish DB-driven helper: given `sql` + `orderId`, returns a discriminated result (`not_found` / `not_paid` / `no_tickets` / `ok` with PDF buffer + filename). No HTTP concerns. |
| `lib/server/ticketPdfForOrder.test.ts` | Create | Cover all four result branches against a fake `sql`, mocking `generateTicketsPdf`. |
| `app/api/tickets/orders/[id]/pdf/route.ts` | Create | Thin orchestration: UUID validation, rate limit, `TICKET_QR_SECRET` fail-closed check, call the helper, map result to an HTTP response (binary PDF or JSON error), consistent with `resend/route.ts`. |
| `app/event/[id]/ticket/[dateId]/confirm/page.tsx` | Modify | Add a download link in the `status === "paid" && hasTickets` branch, pointing at the new route. |

No schema changes, no new dependencies (`pdfkit`, `qrcode` already installed), no changes to `sendTicketEmail.ts` or the resend route.

---

### Task 1: Multi-page PDF renderer

**Files:**
- Modify: `lib/generateTicketPdf.ts`
- Test: `lib/generateTicketPdf.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// lib/generateTicketPdf.test.ts
import { describe, it, expect } from "vitest";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { generateTicketPdf, generateTicketsPdf } from "@/lib/generateTicketPdf";

const COMMON = {
  eventName: "Rock & Roll Cabaret",
  date: "Saturday, 1 August 2026",
  time: "19:00",
  productionTheme: null,
};

describe("generateTicketsPdf", () => {
  it("emits one page per seat, in order", async () => {
    const buffer = await generateTicketsPdf(
      [
        { seatLabel: "A1", qrPayload: "ticket-a.sig-a" },
        { seatLabel: "A2", qrPayload: "ticket-b.sig-b" },
        { seatLabel: "B7", qrPayload: "ticket-c.sig-c" },
      ],
      COMMON,
    );
    const doc = await PDFLibDocument.load(buffer);
    expect(doc.getPageCount()).toBe(3);
  });

  it("single-seat output matches generateTicketPdf's page count", async () => {
    const single = await generateTicketPdf({
      seatLabel: "A1",
      qrPayload: "ticket-a.sig-a",
      ...COMMON,
    });
    const multi = await generateTicketsPdf([{ seatLabel: "A1", qrPayload: "ticket-a.sig-a" }], COMMON);
    const singleDoc = await PDFLibDocument.load(single);
    const multiDoc = await PDFLibDocument.load(multi);
    expect(multiDoc.getPageCount()).toBe(singleDoc.getPageCount());
  });
});
```

This test needs a PDF page-counting library. Check first whether one is already available before adding a new dependency:

Run: `npm ls pdf-lib`

If absent, install it as a dev dependency (it's only used to *read* PDFs in tests — `pdfkit` itself has no page-count API to assert against):

Run: `npm install -D pdf-lib`

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run lib/generateTicketPdf.test.ts`
Expected: FAIL — `generateTicketsPdf` is not exported / `TypeError: generateTicketsPdf is not a function`.

- [ ] **Step 3: Refactor `generateTicketPdf.ts` to extract the page drawer and add `generateTicketsPdf`**

Replace the body of `lib/generateTicketPdf.ts` with:

```ts
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import type { ProductionTheme } from "@/types";

const W = 620;
const H = 290;

const DEFAULT_THEME = {
  bg: "#0a0a0a",
  accent1: "#c9a84c",
  accent2: "#c9a84c",
  tagline: null,
};

interface TicketSeat {
  seatLabel: string;
  qrPayload: string;
}

interface TicketCommon {
  eventName: string;
  date: string;
  time: string;
  productionTheme: ProductionTheme | null;
}

/** Draws one ticket onto the document's *current* page. Caller owns paging. */
async function drawTicketPage(doc: PDFKit.PDFDocument, seat: TicketSeat, common: TicketCommon) {
  const pt = { ...DEFAULT_THEME, ...common.productionTheme };
  const { seatLabel, qrPayload } = seat;
  const { eventName, date, time } = common;

  // ── Background ───────────────────────────────────────────────
  doc.rect(0, 0, W, H).fill(pt.bg);
  doc.rect(W / 2, 0, W / 2, H).fillOpacity(0.04).fill(pt.accent2).fillOpacity(1);
  doc.rect(0, 0, 5, H).fill(pt.accent1);

  const logoPath = path.join(process.cwd(), "public", "logo.png");

  // ── QR Code ──────────────────────────────────────────────────
  const qrSize = 176;
  const qrX = W - qrSize - 44;
  const qrY = (H - qrSize) / 2;

  const qrBuffer = await QRCode.toBuffer(qrPayload, {
    width: qrSize,
    margin: 1,
    color: { dark: "#0a0a0a", light: "#f0f0f0" },
  });

  doc.roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 6).fill("#f0f0f0");
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  // ── Divider ──────────────────────────────────────────────────
  const divX = qrX - 36;
  doc.moveTo(divX, 28).lineTo(divX, H - 28).strokeColor("#2a2a2a").lineWidth(1).stroke();

  // ── Left content ─────────────────────────────────────────────
  const lPad = 32;
  let y = 32;

  doc.font("Helvetica").fontSize(7).fillColor("#c9a84c").text("GENTLEMAN PRODUCTIONS", lPad, y, { characterSpacing: 1.5 });
  y += 20;

  doc.font("Helvetica-Bold").fontSize(21).fillColor("#f5f5f5").text(eventName, lPad, y, { width: divX - lPad - 16 });
  y += doc.heightOfString(eventName, { width: divX - lPad - 16 }) + 6;

  if (pt.tagline) {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(pt.accent1).text(pt.tagline, lPad, y, { width: divX - lPad - 16 });
    y += 20;
  }

  y += 4;

  doc.font("Helvetica").fontSize(11).fillColor("#888888").text(date, lPad, y);
  y += 16;
  doc.font("Helvetica").fontSize(11).fillColor("#888888").text(time, lPad, y);

  // ── Seat ─────────────────────────────────────────────────────
  const seatY = H - 70;
  doc.font("Helvetica").fontSize(8).fillColor("#888888").text("SEAT", lPad, seatY, { characterSpacing: 2 });
  doc.font("Helvetica-Bold").fontSize(38).fillColor(pt.accent2).text(seatLabel, lPad, seatY + 12);

  // ── Bottom strip ─────────────────────────────────────────────
  doc.rect(0, H - 26, W, 26).fill("#0d0d0d");
  doc.font("Helvetica").fontSize(7.5).fillColor("#555555").text(
    "Show this QR code at the door  ·  One scan per person  ·  Not transferable",
    0, H - 17, { width: W - 40, align: "center" }
  );
  try {
    doc.image(logoPath, W - 30, H - 24, { height: 22 });
  } catch (_) { /* skip if not found */ }
}

/** Single-ticket PDF. Used by sendTicketEmail — one attachment per seat. */
export async function generateTicketPdf(seat: TicketSeat & TicketCommon): Promise<Buffer> {
  return generateTicketsPdf([seat], seat);
}

/** Multi-page PDF, one ticket per page, in the order given. */
export async function generateTicketsPdf(seats: TicketSeat[], common: TicketCommon): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: [W, H],
      margin: 0,
      info: { Title: `Tickets – ${common.eventName}`, Author: "Gentleman Productions" },
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    (async () => {
      for (let i = 0; i < seats.length; i++) {
        if (i > 0) doc.addPage({ size: [W, H], margin: 0 });
        await drawTicketPage(doc, seats[i], common);
      }
      doc.end();
    })().catch(reject);
  });
}
```

Note the signature of `generateTicketPdf` is unchanged from the caller's perspective (`sendTicketEmail.ts` calls it with `{ seatLabel, qrPayload, eventName, date, time, productionTheme }`) — it now just forwards to `generateTicketsPdf` with a one-element array.

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run lib/generateTicketPdf.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 5: Confirm the existing email test still passes (this file's behavior must not change)**

Run: `npx vitest run lib/sendTicketEmail.test.ts`
Expected: PASS — `Ticket-A1.pdf` attachment assertion still holds.

- [ ] **Step 6: Commit**

```bash
git add lib/generateTicketPdf.ts lib/generateTicketPdf.test.ts package.json package-lock.json
git commit -m "feat: add generateTicketsPdf for multi-page ticket PDFs"
```

---

### Task 2: `ticketPdfForOrder` helper (DB logic, no HTTP)

**Files:**
- Create: `lib/server/ticketPdfForOrder.ts`
- Test: `lib/server/ticketPdfForOrder.test.ts` (create)

Context for whoever implements this task: read `lib/server/orderFulfillment.ts` and `app/api/tickets/orders/[id]/resend/route.ts` first — this helper's query shape (order lookup → status check → sold-tickets-joined-to-seats lookup → event/date lookup) is deliberately identical to what the resend route already does inline, just factored out so it can be unit-tested the way `applyMolliePaymentToOrder` is.

- [ ] **Step 1: Write the failing test**

```ts
// lib/server/ticketPdfForOrder.test.ts
import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateTicketsPdf: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-bytes")),
}));

vi.mock("@/lib/generateTicketPdf", () => ({
  generateTicketsPdf: mocks.generateTicketsPdf,
}));

import { loadTicketsPdfForOrder } from "@/lib/server/ticketPdfForOrder";

const ORDER_ID = "order-1";
const EVENT_UUID = "event-1";
const DATE_UUID = "date-1";

interface FakeState {
  order: { id: string; status: string; event_uuid: string; date_uuid: string } | null;
  soldTickets: { id: string; row: string; seat_number: number }[];
  events: { uuid: string; title: string; production_theme: null; dates: { uuid: string; start_time: string }[] }[];
}

function createFakeSql(state: FakeState) {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM orders")) {
      return state.order && state.order.id === values[0] ? [state.order] : [];
    }
    if (text.includes("FROM tickets")) {
      return state.order && state.order.status === "paid" ? state.soldTickets : [];
    }
    if (text.includes("FROM events")) {
      return state.events.filter((e) => e.uuid === values[0]);
    }
    throw new Error(`Unexpected query in test fake: ${text}`);
  }) as any;
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: { id: ORDER_ID, status: "paid", event_uuid: EVENT_UUID, date_uuid: DATE_UUID },
    soldTickets: [{ id: "ticket-a", row: "A", seat_number: 1 }],
    events: [{ uuid: EVENT_UUID, title: "Test Show", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }],
    ...overrides,
  };
}

describe("loadTicketsPdfForOrder", () => {
  it("returns not_found for an unknown order", async () => {
    const sql = createFakeSql(freshState({ order: null }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result.kind).toBe("not_found");
  });

  it("returns not_paid with the order's status for a pending order", async () => {
    const sql = createFakeSql(freshState({ order: { id: ORDER_ID, status: "pending", event_uuid: EVENT_UUID, date_uuid: DATE_UUID } }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result).toEqual({ kind: "not_paid", status: "pending" });
  });

  it("returns no_tickets for a paid order with zero sold tickets", async () => {
    const sql = createFakeSql(freshState({ soldTickets: [] }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result.kind).toBe("no_tickets");
  });

  it("returns ok with a PDF buffer and a sanitized filename on the happy path", async () => {
    const sql = createFakeSql(freshState());
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.buffer).toEqual(Buffer.from("fake-pdf-bytes"));
    expect(result.filename).toBe("Tickets-Test-Show.pdf");
    expect(mocks.generateTicketsPdf).toHaveBeenCalledTimes(1);
    const [seats] = mocks.generateTicketsPdf.mock.calls[0];
    expect(seats).toEqual([{ seatLabel: "A1", qrPayload: expect.any(String) }]);
  });

  it("falls back to a plain filename when the event title has no safe characters", async () => {
    const sql = createFakeSql(freshState({ events: [{ uuid: EVENT_UUID, title: "🎭🎭🎭", production_theme: null, dates: [{ uuid: DATE_UUID, start_time: "2026-08-01T19:00:00Z" }] }] }));
    const result = await loadTicketsPdfForOrder(sql, ORDER_ID);
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.filename).toBe("Tickets.pdf");
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run lib/server/ticketPdfForOrder.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/ticketPdfForOrder'`.

- [ ] **Step 3: Implement the helper**

```ts
// lib/server/ticketPdfForOrder.ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { generateTicketsPdf } from "@/lib/generateTicketPdf";
import { signTicketToken } from "./ticketToken";
import type { Event, Order } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export type TicketPdfResult =
  | { kind: "not_found" }
  | { kind: "not_paid"; status: string }
  | { kind: "no_tickets" }
  | { kind: "ok"; buffer: Buffer; filename: string };

/** Filename-safe: strips everything but alphanumerics/spaces/hyphens, collapses runs. */
function sanitizeForFilename(title: string): string {
  const cleaned = title.replace(/[^A-Za-z0-9 -]/g, "").trim().replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned : "";
}

/**
 * Re-derives an order's tickets as a single multi-page PDF, straight from the
 * database — no caching, no storage. This intentionally mirrors the resend
 * route's read pattern so a PDF requested here always reflects the current
 * TICKET_QR_SECRET, the same way a re-sent email does. See
 * docs/superpowers/specs/2026-07-29-ticket-pdf-download-design.md for why a
 * stored/cached PDF was rejected (goes stale across secret rotation).
 */
export async function loadTicketsPdfForOrder(sql: Sql, orderId: string): Promise<TicketPdfResult> {
  const orderRows = await sql`SELECT * FROM orders WHERE id = ${orderId};`;
  const order = orderRows[0] as Order | undefined;
  if (!order) return { kind: "not_found" };

  if (order.status !== "paid") return { kind: "not_paid", status: order.status };

  // Read the authoritative sold set rather than trusting the order total —
  // same reasoning as the resend route: an order can be paid and hold no
  // seats if fulfilment lost them.
  const soldTickets = await sql`
    SELECT t.id, s."row" AS row, s.seat_number AS seat_number
    FROM tickets t JOIN seats s ON s.id = t.seat_id
    WHERE t.order_id = ${orderId} AND t.status = 'sold';
  `;
  if (soldTickets.length === 0) return { kind: "no_tickets" };

  const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = event?.dates?.find((d) => d.uuid === order.date_uuid);
  const eventName = event?.title ?? "Show";

  const d = date?.start_time ? new Date(date.start_time) : null;
  const dateStr = d
    ? d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  const timeStr = d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

  const buffer = await generateTicketsPdf(
    soldTickets.map((t) => ({
      seatLabel: `${t.row}${t.seat_number}`,
      qrPayload: signTicketToken(t.id),
    })),
    { eventName, date: dateStr, time: timeStr, productionTheme: event?.production_theme ?? null },
  );

  const safeName = sanitizeForFilename(eventName);
  const filename = safeName ? `Tickets-${safeName}.pdf` : "Tickets.pdf";

  return { kind: "ok", buffer, filename };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `npx vitest run lib/server/ticketPdfForOrder.test.ts`
Expected: PASS — all five cases green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/server/ticketPdfForOrder.ts lib/server/ticketPdfForOrder.test.ts
git commit -m "feat: add loadTicketsPdfForOrder helper for on-demand ticket PDFs"
```

---

### Task 3: `GET /api/tickets/orders/[id]/pdf` route

**Files:**
- Create: `app/api/tickets/orders/[id]/pdf/route.ts`

This route has no direct test file, matching this codebase's existing convention: `checkout/route.ts` and `resend/route.ts` are also untested at the route layer — their logic is unit-tested one level down (`checkoutValidation.ts`, `orderFulfillment.ts`), which is exactly what Task 2 did here via `ticketPdfForOrder.ts`. This task is wiring, not logic.

- [ ] **Step 1: Implement the route**

```ts
// app/api/tickets/orders/[id]/pdf/route.ts
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
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
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
```

- [ ] **Step 2: Manual smoke test against a real (or seeded) paid order**

Run: `npm run dev`, then in a browser or via curl hit
`http://localhost:3000/api/tickets/orders/<a real paid order id>/pdf`

Expected: a PDF downloads/opens with one page per sold seat, matching the layout of the emailed tickets.

Also verify the negative paths return the expected status codes:
- an unpaid/pending order id → `409`
- a syntactically invalid id (e.g. `not-a-uuid`) → `404`
- a nonexistent-but-valid-uuid → `404`

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/tickets/orders/[id]/pdf/route.ts"
git commit -m "feat: add GET /api/tickets/orders/[id]/pdf ticket download route"
```

---

### Task 4: Confirm page download link

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/confirm/page.tsx`

- [ ] **Step 1: Add the download link to the paid-with-tickets branch**

In `ConfirmContent`, the `status === "paid"` block currently reads:

```tsx
  if (status === "paid") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>You&rsquo;re in!</h1>
        <p className={styles.copy}>
          Your tickets are confirmed. Check your email — a ticket with your QR code is on its way.
        </p>
      </main>
    );
  }
```

Change it to add a download link, reusing the existing `.backLink` treatment (gold, underlined, small-caps) so no new CSS is needed:

```tsx
  if (status === "paid") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>You&rsquo;re in!</h1>
        <p className={styles.copy}>
          Your tickets are confirmed. Check your email — a ticket with your QR code is on its way.
        </p>
        <a href={`/api/tickets/orders/${orderId}/pdf`} className={styles.backLink}>
          Download your tickets (PDF)
        </a>
      </main>
    );
  }
```

`orderId` is already in scope (`searchParams.get("order")`) and is non-null on this branch, since `status` was only set after a successful `/api/tickets/orders/${orderId}` fetch.

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, walk through a real checkout to a paid order (or navigate directly to `/event/<id>/ticket/<dateId>/confirm?order=<a paid order id>`), confirm:
- the "You're in!" screen now shows the download link below the copy
- clicking it downloads a PDF with the correct seats
- the link is visually consistent with the rest of the page (gold, matches `.backLink` styling used elsewhere on this page)

- [ ] **Step 3: Run the full test suite once more**

Run: `npx vitest run`
Expected: PASS — no regressions in `sendTicketEmail.test.ts`, `generateTicketPdf.test.ts`, `ticketPdfForOrder.test.ts`, or any other suite.

- [ ] **Step 4: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/confirm/page.tsx"
git commit -m "feat: add ticket PDF download link to the confirmation page"
```

---

### Task 5: Document the new endpoint

**Files:**
- Modify: `SECURITY.md`

The "Ticket Security" section documents the resend endpoint as the QR re-signing / recovery mechanism after a `TICKET_QR_SECRET` rotation. Add one sentence noting the new download route shares that same re-signing behavior (so it's also automatically fixed by a rotation, no separate action needed), to keep that section accurate.

- [ ] **Step 1: Edit `SECURITY.md`**

In the "Rotating the secret invalidates every ticket already emailed..." bullet under "QR Ticket Tokens", add a trailing sentence:

```markdown
  is the recovery path for a customer who lost their confirmation email.
  The confirmation page's own PDF download
  (`GET /api/tickets/orders/<order-id>/pdf`) re-signs on every request
  too, so it never needs a manual re-send after rotation.
```

(i.e. append after the existing sentence ending "...for a customer who lost their confirmation email.")

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: note the ticket PDF download route in SECURITY.md"
```

---

## Post-implementation

Run the full suite once more end to end before calling this done:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

All three must be clean. Then walk the golden path manually once (checkout → confirm page → download link → open PDF → verify QR scans decode to `<ticket-uuid>.<signature>`) since this touches a real payment/ticketing flow and type checks alone don't prove the PDF renders correctly.
