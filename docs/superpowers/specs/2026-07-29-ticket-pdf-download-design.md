# Ticket PDF download on the confirmation page — design

Date: 2026-07-29
Status: Approved

## Problem

Tickets (styled PDF, one per seat, each with a signed door QR) are currently
delivered only as email attachments via [lib/sendTicketEmail.ts](../../../lib/sendTicketEmail.ts).
Resend can fail to deliver, land in spam, or simply not arrive in time for a
customer checking their phone at the door. The confirmation page
([app/event/[id]/ticket/[dateId]/confirm/page.tsx](../../../app/event/[id]/ticket/[dateId]/confirm/page.tsx))
currently only tells the customer "check your email" — there's no in-app
fallback.

## Goal

Let a customer download their tickets as a PDF directly from the confirmation
page, as a backup to the email.

## Access model

The confirm page identifies an order only by the `orders.id` UUID in the URL
(`?order=<uuid>`), a `gen_random_uuid()` value (122 bits of entropy, not
enumerable). This is the same trust level the existing
`GET /api/tickets/orders/[id]` status-poll endpoint already assumes. The new
PDF download route uses the **same model — order UUID alone**, restricted to
paid orders, with rate limiting (see below). This is a deliberate choice: it
matches the trust boundary already established for this URL, and a leaked
confirm link is no more sensitive than a forwarded confirmation email — both
already grant access to the same tickets.

## Approaches considered

**A — On-demand generation, no storage (chosen).** The new route re-derives
the PDF from the database on every request, exactly like the existing
resend endpoint ([app/api/tickets/orders/[id]/resend/route.ts](../../../app/api/tickets/orders/[id]/resend/route.ts))
already does for email. No new storage dependency, and it stays correct
across `TICKET_QR_SECRET` rotation: [SECURITY.md](../../../SECURITY.md)
documents that rotating the secret invalidates every previously-issued QR
and requires re-signing via the resend endpoint. A cached/stored PDF would
silently keep serving dead QR codes after a rotation.

**B — Generate once at fulfilment, store the bytes.** Faster repeat
downloads, but introduces a storage dependency the project doesn't have
(no blob store today), and reintroduces exactly the stale-QR-after-rotation
bug Approach A avoids. Rejected.

**C — Client-side PDF assembly.** Would require shipping ticket-styling
logic and QR-payload construction to the browser. `pdfkit` is server-only,
and exposing how the signed payload is built weakens the trust boundary
`lib/server/ticketToken.ts` exists to enforce (ticket id alone must never be
sufficient — see its header comment). Rejected.

## Design

### 1. Shared PDF renderer

Refactor [lib/generateTicketPdf.ts](../../../lib/generateTicketPdf.ts) to
extract the per-ticket page-drawing logic (everything currently drawn onto
a single-page `PDFDocument`) into an internal function parameterized by the
target `PDFDocument`/page. `generateTicketPdf()` keeps its existing
signature and behavior (single ticket, one `PDFDocument`, used by
`sendTicketEmail`) as a thin wrapper around the shared drawer — so
`lib/sendTicketEmail.test.ts` and the email attachment behavior are
unaffected.

Add a new export:

```ts
generateTicketsPdf(
  seats: { seatLabel: string; qrPayload: string }[],
  common: { eventName: string; date: string; time: string; productionTheme: ProductionTheme | null }
): Promise<Buffer>
```

It opens one `PDFDocument` sized `[W, H]` (matching the existing single-ticket
size), draws seat 0 on the initial page, then calls `doc.addPage({ size: [W, H], margin: 0 })`
and draws each subsequent seat, producing one buffer containing all tickets
as separate pages (one QR per page, so the door scanner sees exactly one
code per screen/printout).

### 2. New route — `GET /api/tickets/orders/[id]/pdf`

Mirrors the resend route's read pattern and reuses the same error-message
conventions:

1. Validate `id` is a UUID → `404` otherwise (`isUuid` from
   `lib/server/checkoutValidation.ts`).
2. Rate-limit check (see below) → `429` if exceeded.
3. Fail closed if `TICKET_QR_SECRET` is unset → `503`, same message pattern
   as checkout/resend ("Ticket issuing is not configured...").
4. Load the order. Not found → `404`.
5. Require `order.status === 'paid'` → `409` otherwise ("Order is
   `<status>`, not paid — there are no tickets to download.").
6. Load `sold` tickets joined to seats for this order. Empty → `409`
   ("Order is paid but holds no sold tickets — this needs a refund or a
   reseat, not a download."), same case the resend route already guards.
7. Load the event and matching date for `eventName`/`date`/`time`.
8. Call `generateTicketsPdf` with the sold tickets (signing each QR via
   `signTicketToken`, exactly as the resend route does for email).
9. Respond `200` with:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="Tickets-<sanitized-event-name>.pdf"`
     — event title is user-supplied (admin-entered) free text, so it is
     sanitized to a safe filename charset (alphanumerics, spaces, hyphens)
     before being placed in the header, to avoid header-injection or
     invalid-filename issues. If sanitization strips the title to nothing
     (e.g. an emoji-only title), fall back to the literal filename
     `Tickets.pdf`.
   - the PDF buffer as the body.

Unhandled errors are caught and logged server-side, returning a generic
`500` — never echoing driver/provider internals, consistent with every
other route in `app/api/tickets/`.

### 3. Rate limiting

Reuse `checkRateLimit` / `getClientIp` from
[lib/rateLimit.ts](../../../lib/rateLimit.ts), keyed as `` `pdf:${ip}` ``.
Limit: 30 requests per 15-minute window per IP. This is more generous than
the login limiter's default (5/15min) because a venue's shared Wi-Fi/NAT
can put several genuine customers behind one IP, and because re-opening the
confirm page (e.g. reloading, switching devices) is a normal, non-abusive
customer action. The route is still a signed-QR minting endpoint, so it
must not be unlimited.

### 4. Confirm page UI

In the `status === "paid" && hasTickets` branch of
[app/event/[id]/ticket/[dateId]/confirm/page.tsx](../../../app/event/[id]/ticket/[dateId]/confirm/page.tsx),
add a link styled consistent with the existing `.backLink` treatment in
[Confirm.module.css](../../../app/event/[id]/ticket/[dateId]/confirm/Confirm.module.css)
(e.g. "Download your tickets (PDF)"), pointing at
`/api/tickets/orders/${orderId}/pdf`. A plain `<a>` tag is sufficient — the
`Content-Disposition: attachment` response header triggers the browser
download, no client-side JS required. Existing copy ("Check your email — a
ticket with your QR code is on its way.") is kept; the link is presented as
a backup option, not a replacement.

### 5. Testing

- `lib/generateTicketPdf.test.ts` (new or extended): `generateTicketsPdf`
  produces a PDF with one page per seat (page count assertion), and a
  single-seat call still matches what `generateTicketPdf` produces.
- Route test for `app/api/tickets/orders/[id]/pdf`, following the
  conventions in `lib/server/orderFulfillment.test.ts` and the existing
  resend route:
  - pending order → `409`
  - paid order with zero sold tickets → `409`
  - missing `TICKET_QR_SECRET` → `503`
  - invalid UUID → `404`
  - happy path → `200`, `Content-Type: application/pdf`, page count equals
    sold-ticket count.

## Out of scope

- No changes to the email flow, `sendTicketEmail`, or the resend endpoint.
- No new storage/blob dependency.
- No change to the `orders`/`tickets` schema.
- No auth beyond the existing order-UUID + rate-limit model (email
  re-entry and short-lived tokens were considered and explicitly declined
  in favor of matching the existing trust boundary).
