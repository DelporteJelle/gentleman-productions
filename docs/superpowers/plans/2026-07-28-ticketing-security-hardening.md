# Ticketing Security Hardening — Implementation Plan

> **STATUS: EXECUTED AND MERGED-READY.** Delivered in 20 commits, `a0c2c30..e489506`.
> **The code blocks below are the plan as originally written, and five of them are wrong.**
> They are kept verbatim as the record of intent. Read the corrections below before treating
> any snippet here as a reference — the shipped source is the authority, not this document.

## Corrections applied during execution

Each was found by review, not by the plan, and each is fixed in the shipped code:

1. **Task 5 — the paid path could strand a charged customer.** The plan claimed the order `paid`
   *before* selling tickets. If the ticket `UPDATE` then threw, a webhook retry found the order
   already `paid`, matched zero rows, returned `"ignored"`, and never retried the sale. Shipped
   order is **sell → read authoritative sold set → claim paid → email**, which makes every step
   retry-safe.
2. **Task 7 — the events join is invalid SQL.** `LEFT JOIN events e ON e.uuid = t.event_uuid`
   cannot run: `events.uuid` is `uuid`, `tickets.event_uuid` is `text`, and Postgres has no
   implicit cast between them. Shipped form is `e.uuid::text = t.event_uuid`.
3. **Task 8 — the scanner camera could not restart.** `startedRef` was set once and never reset,
   so re-selecting the blank performance option left the camera dark until a page reload, and dev
   StrictMode ran with no scanner at all. Shipped code drops `startedRef` for a per-effect scanner
   instance plus a cancellation flag, and wraps `stop()` in `try/catch` because `html5-qrcode`
   throws *synchronously* when `start()` has not yet reached `SCANNING`.
4. **Task 10 — the poll's `catch` path was unguarded against unmount**, so a rejected in-flight
   fetch could schedule a timer after cleanup had run. Shipped code adds `if (cancelled) return;`
   after the `catch`.
5. **Task 4 — the plan fixed the wrong end of its own headline bug.** The atomic claim stops two
   *simultaneous* checkouts colliding, but the scenario in Task 4's issue statement is a *later*
   checkout taking a *lapsed* hold, which must stay allowed. Task 5's zero-ticket guard suppressed
   the symptom (the ticketless email) while the cause survived — and the confirm page then told the
   customer "You're in!". Shipped code adds an honest fourth confirm-page branch and refuses to
   reclaim a lapsed hold whose order still has a live pending payment (bounded to one hour, so an
   abandoned order cannot lock seats forever).

Also added beyond the plan: an admin-only ticket resend endpoint (signing removed the old manual
recovery path — the ticket id used to *be* the credential — and nothing replaced it), a
fail-closed `TICKET_QR_SECRET` guard on checkout, and a test harness that reads the real SQL
`WHERE` guards instead of reimplementing them.

**Deployment requirement:** `TICKET_QR_SECRET` must exist in every environment that issues or scans
tickets. Checkout now returns 503 without it rather than capturing unfulfillable payments.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 14 security and correctness findings in the seat-reservation → payment → email → door-scan flow, so that a ticket cannot be forged or stolen, a seat cannot be double-sold, and a paying customer cannot end up without seats.

**Architecture:** Three structural changes carry most of the fixes. (1) The QR payload stops being a bare database id and becomes an HMAC-signed token, so possession of an id is no longer possession of a ticket. (2) Seat reservation collapses from a read-then-write pair into a single conditional `UPDATE … RETURNING`, so Postgres — not application code — arbitrates who gets the seat. (3) Payment application moves out of the webhook route into a shared, idempotent `applyMolliePaymentToOrder()` that both the webhook and the order-status poll call, so a dropped webhook self-heals instead of silently losing an order. Everything else is authorization gating, input validation, and output escaping layered on top.

**Tech Stack:** Next.js 16 App Router (route handlers + server components) · Neon serverless Postgres (HTTP driver — single statements are atomic, no interactive transactions) · Mollie API client v4 · Resend + pdfkit + qrcode · node:crypto HMAC · Vitest (node environment) · TypeScript.

## Global Constraints

- **Branch:** work on `dev`. Do not commit to `main`.
- **Pre-existing uncommitted change:** the working tree has `M app/HomeClient.tsx` from unrelated work. Never `git add` it and never use `git add -A` / `git commit -a`. Every commit in this plan lists its files explicitly.
- **Commit trailer:** recent commits carry `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Match the trailer style of `git log -1` at the time you commit, updating the model name to the one you are running as.
- **Commit style:** conventional commits, one commit per task, prefix `fix:` or `feat:`.
- **Verification commands:** `npm run test` (vitest, must be green), `npm run lint` (must be clean), `npm run build` (must succeed). Run all three before the commit of any task that changes TypeScript.
- **Role string is `"ADMIN"` (uppercase).** Confirmed by `components/Navigation/Navigation.tsx:17`. `app/api/auth/login/route.ts:52` defaults absent roles to lowercase `"user"`. Task 0 verifies the real values in the database before anything depends on them. **Never guess this string** — a wrong value locks staff out of the scanner at the door.
- **No new npm dependencies.** Everything uses packages already in `package.json` plus `node:crypto`.
- **Neon has no interactive transactions.** The HTTP driver executes one statement per round-trip. Atomicity must therefore come from writing a *single* statement whose `WHERE` clause encodes the precondition, never from `BEGIN`/`COMMIT`.
- **Do not "fix" findings outside this plan's scope.** Out of scope by explicit decision: the O(dates × seats) provisioning loop, the stale-hold sweep, the CSP `unsafe-inline`/`unsafe-eval`, and rate limiting of any kind (the user decided against rate limits for checkout).

---

## Severity Staging

Work the stages in order. Each stage is independently deployable and leaves the system strictly safer than before.

| Stage | Findings | Why this order |
|---|---|---|
| **0 — Preflight** | — | Establishes the secret and the role string that later tasks depend on. No code. |
| **1 — Critical** | 1, 2, 3 | Free entry, double-sold seats, duplicate emails. All three are exploitable or actively misfiring today. |
| **2 — High** | 4, 14, 6, 5, 7, 8 | Privilege and correctness at the door and in the basket. |
| **3 — Medium** | 9, 10, 11, 12, 13 | Payment verification, self-healing fulfilment, honest customer messaging, injection and info-leak hygiene. |

---

## File Structure

**Create (new):**
- `lib/server/ticketToken.ts` — `signTicketToken(ticketId)` / `verifyTicketToken(token)`. HMAC-SHA256 over the ticket UUID. Pure except for reading `process.env.TICKET_QR_SECRET`. No DB, no React.
- `lib/server/ticketToken.test.ts` — round-trip, tamper, and legacy-payload rejection tests.
- `lib/server/checkoutValidation.ts` — `validateCheckoutInput(body)`, `isUuid(value)`, `MAX_SEATS_PER_ORDER`. Pure. No DB, no env.
- `lib/server/checkoutValidation.test.ts` — validation boundary tests.
- `lib/server/orderFulfillment.ts` — `applyMolliePaymentToOrder(sql, paymentId)` and the pure helper `paymentAmountMatchesOrder(value, cents)`. The single place where an order transitions to `paid`/`cancelled` and where ticket emails are sent.
- `lib/server/orderFulfillment.test.ts` — tests for `paymentAmountMatchesOrder` only (the DB path is verified manually).
- `lib/server/requireAdminPage.ts` — server-component guard that redirects non-admins away from a page.
- `app/private/scan/layout.tsx` — applies the admin guard to the scanner.
- `app/private/tickets/layout.tsx` — applies the admin guard to the order summary.

**Modify:**
- `lib/generateTicketPdf.ts` — QR encodes a signed token instead of the raw id.
- `lib/sendTicketEmail.ts` — signs each ticket id; HTML-escapes all interpolated values.
- `lib/text.ts` — add `escapeHtml`.
- `lib/text.test.ts` — create if absent; add `escapeHtml` tests.
- `lib/seatSelection.ts` — tolerate `id: null` on non-purchasable seats.
- `lib/seatSelection.test.ts` — add null-id cases.
- `types.tsx` — `SeatTicket.id` becomes `string | null`.
- `app/api/tickets/seats/route.ts` — withhold ticket ids for sold/live-held seats.
- `app/api/tickets/checkout/route.ts` — full rewrite: validation, atomic hold, generic errors.
- `app/api/tickets/webhook/mollie/route.ts` — thin caller of `applyMolliePaymentToOrder`.
- `app/api/tickets/orders/[id]/route.ts` — reconcile against Mollie when still pending.
- `app/api/tickets/scan/route.ts` — admin-only, verifies signature, scopes to a performance, atomic claim.
- `app/api/tickets/summary/route.ts` — admin-only.
- `app/private/scan/page.tsx` — performance picker, sends `{ token, dateUuid }`, renders the `wrong_date` state.
- `app/private/scan/Scan.module.css` — picker and `wrong_date` styles.
- `app/event/[id]/ticket/[dateId]/page.tsx` — null-id tolerance.
- `app/event/[id]/ticket/[dateId]/checkout/page.tsx` — null-id tolerance.
- `app/event/[id]/ticket/[dateId]/confirm/page.tsx` — distinguish pending from cancelled.
- `SECURITY.md` — document the QR signing scheme and the new env var.

**Total: 9 new files, 17 modified files.**

---

# Stage 0 — Preflight

### Task 0: Establish the signing secret and confirm the admin role string

**Files:**
- Modify: `.env.local` (not tracked by git — never commit it)
- Modify: `SECURITY.md`

**Interfaces:**
- Produces: environment variable `TICKET_QR_SECRET` (hex string, 64 chars), and a confirmed literal for the admin role used by every `requireRole` call in Stage 2.

**Issue this addresses:** none directly — this task exists because Tasks 1 and 9 hard-depend on values that must not be guessed. Deploying an admin gate with the wrong role string means door staff cannot scan tickets on show night; deploying signing without the secret present in Vercel means every ticket reads as invalid.

- [ ] **Step 1: Audit the roles that actually exist in the database**

`components/Navigation/Navigation.tsx:17` compares against `"ADMIN"` and `"CREATE_ONLY"`, but `app/api/auth/login/route.ts:52` defaults to lowercase `"user"`. Find out what is really stored:

```powershell
npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`SELECT username, role FROM users ORDER BY username;`.then(r=>console.table(r))"
```

Write the exact role string of the account that will staff the door into the checklist below. Every later task that says `ADMIN_ROLE` uses **that literal**.

- [ ] **Step 2: Record the decision**

Fill this in and keep it in the commit message of Task 5:

```
ADMIN_ROLE = "____"     # exact string from step 1
Door-staff accounts confirmed to have this role: ____
```

If the door account does **not** currently have the admin role, fix the data before Stage 2 ships:

```powershell
npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`UPDATE users SET role='ADMIN' WHERE username='<door-account>';`.then(()=>console.log('ok'))"
```

- [ ] **Step 3: Audit whether signed tickets would invalidate anything already sold**

```powershell
npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`SELECT count(*)::int AS sold FROM tickets WHERE status='sold';`.then(r=>console.log(r))"
```

Task 2 makes the scanner **reject unsigned payloads**, which is the entire point of the fix — accepting them as a fallback would leave the hole wide open. If this count is `0`, proceed with no further action. If it is greater than `0`, real customers hold PDFs whose QR codes will stop working, and you must re-send those tickets after Stage 1 ships. Stop and confirm the re-send with the site owner before continuing; do not silently break issued tickets.

- [ ] **Step 4: Generate the secret**

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to `.env.local`:

```
TICKET_QR_SECRET=<paste the 64-char hex string>
```

Add the **same value** to the Vercel project (Settings → Environment Variables → Production **and** Preview). The secret must be identical in every environment that both issues and scans tickets — a mismatch makes every ticket read as invalid at the door.

- [ ] **Step 5: Document it**

Append to `SECURITY.md` under `## Authentication Security`:

```markdown
## Ticket Security

### QR Ticket Tokens

Ticket QR codes contain `<ticket-uuid>.<base64url HMAC-SHA256>`, signed with
`TICKET_QR_SECRET`. The scanner (`/api/tickets/scan`) rejects any payload whose
signature does not verify, so knowing a ticket id is not sufficient to enter.

- `TICKET_QR_SECRET` must be a high-entropy random value (32 bytes hex) and must
  be **identical** in every environment that issues or scans tickets.
- Rotating the secret invalidates every ticket already emailed. Re-send tickets
  for all `sold` rows after any rotation.
- The scan endpoint is restricted to the admin role and is scoped to a single
  performance chosen by the operator.
```

- [ ] **Step 6: Commit**

```bash
git add SECURITY.md
git commit -m "docs: document ticket QR signing scheme and TICKET_QR_SECRET"
```

`.env.local` is gitignored and must not appear in the commit. Verify with `git status` that only `SECURITY.md` was staged.

---

# Stage 1 — Critical

## Task 1: Signed ticket tokens

**Files:**
- Create: `lib/server/ticketToken.ts`
- Test: `lib/server/ticketToken.test.ts`

**Interfaces:**
- Consumes: `process.env.TICKET_QR_SECRET` from Task 0.
- Produces: `signTicketToken(ticketId: string): string` and `verifyTicketToken(token: string): string | null` — used by Task 2 (PDF generation and scan verification).

**Issue — Finding 1a (Critical): the QR code is an unsigned database id.**

`lib/generateTicketPdf.ts:57` encodes the raw `tickets.id` UUID into the QR, and `app/api/tickets/scan/route.ts:17` accepts any id that is `sold` and unscanned. There is nothing tying the QR to the purchase — the id *is* the credential. Combined with Finding 1b (the seat-map API publishes every ticket id, including sold ones), anyone can read a sold seat's id off a public endpoint, render it as a QR, and walk in; the genuine holder is then turned away as "already scanned".

**The fix:** make the payload unforgeable. `HMAC-SHA256(ticketId, TICKET_QR_SECRET)` is appended to the id, and the scanner recomputes it. Without the server secret, no id can be turned into a working QR — publishing ids becomes harmless. Compare with `timingSafeEqual` so a forger cannot recover a valid signature byte-by-byte from response timing. A UUID contains no `.` and base64url contains no `.`, so a single `.` separator parses unambiguously.

- [ ] **Step 1: Write the failing test**

Create `lib/server/ticketToken.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { signTicketToken, verifyTicketToken } from "@/lib/server/ticketToken";

const TICKET = "3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f21";

describe("ticket tokens", () => {
  beforeAll(() => {
    process.env.TICKET_QR_SECRET = "test-secret-not-used-in-production";
  });

  it("round-trips a ticket id", () => {
    expect(verifyTicketToken(signTicketToken(TICKET))).toBe(TICKET);
  });

  it("embeds the ticket id in the payload followed by a signature", () => {
    const token = signTicketToken(TICKET);
    expect(token.startsWith(`${TICKET}.`)).toBe(true);
    expect(token.length).toBeGreaterThan(TICKET.length + 1);
  });

  it("rejects a bare ticket id with no signature", () => {
    expect(verifyTicketToken(TICKET)).toBeNull();
  });

  it("rejects a tampered ticket id", () => {
    const token = signTicketToken(TICKET);
    const other = "00000000-0000-4000-8000-000000000000";
    expect(verifyTicketToken(`${other}.${token.split(".")[1]}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const [id, sig] = signTicketToken(TICKET).split(".");
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyTicketToken(`${id}.${flipped}`)).toBeNull();
  });

  it("rejects a truncated signature without throwing", () => {
    const [id, sig] = signTicketToken(TICKET).split(".");
    expect(verifyTicketToken(`${id}.${sig.slice(0, 10)}`)).toBeNull();
  });

  it("rejects empty and malformed input", () => {
    expect(verifyTicketToken("")).toBeNull();
    expect(verifyTicketToken(".")).toBeNull();
    expect(verifyTicketToken(".abc")).toBeNull();
    expect(verifyTicketToken(TICKET + ".")).toBeNull();
  });

  it("does not verify a token signed with a different secret", () => {
    const token = signTicketToken(TICKET);
    process.env.TICKET_QR_SECRET = "a-different-secret";
    const result = verifyTicketToken(token);
    process.env.TICKET_QR_SECRET = "test-secret-not-used-in-production";
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/server/ticketToken.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/server/ticketToken"`.

- [ ] **Step 3: Write the implementation**

Create `lib/server/ticketToken.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Ticket QR payloads are `<ticket-uuid>.<base64url HMAC-SHA256>`.
 *
 * The ticket id alone is not a credential: it is published by the public seat
 * map for selectable seats and is trivially enumerable. Only the signature
 * proves the ticket was issued by us, so the scanner must never accept a bare
 * id — see `verifyTicketToken`.
 */
const SEPARATOR = ".";

function secret(): string {
  const value = process.env.TICKET_QR_SECRET;
  if (!value) throw new Error("TICKET_QR_SECRET is not set");
  return value;
}

function signature(ticketId: string): string {
  return createHmac("sha256", secret()).update(ticketId).digest("base64url");
}

/** Build the QR payload for a ticket. */
export function signTicketToken(ticketId: string): string {
  return `${ticketId}${SEPARATOR}${signature(ticketId)}`;
}

/** Return the ticket id if the token is authentic, otherwise null. */
export function verifyTicketToken(token: string): string | null {
  if (typeof token !== "string" || token.length === 0) return null;

  const idx = token.lastIndexOf(SEPARATOR);
  if (idx <= 0 || idx === token.length - 1) return null;

  const ticketId = token.slice(0, idx);
  const provided = Buffer.from(token.slice(idx + 1));
  const expected = Buffer.from(signature(ticketId));

  // timingSafeEqual throws on length mismatch, so screen for it first.
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? ticketId : null;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/server/ticketToken.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm run test` — expected PASS.
Run: `npm run lint` — expected clean.

- [ ] **Step 6: Commit**

```bash
git add lib/server/ticketToken.ts lib/server/ticketToken.test.ts
git commit -m "feat: add HMAC-signed ticket QR tokens"
```

---

## Task 2: Issue signed QR codes and verify them at the door

**Files:**
- Modify: `lib/generateTicketPdf.ts:17-31` (signature), `lib/generateTicketPdf.ts:57` (QR payload)
- Modify: `lib/sendTicketEmail.ts:30`
- Modify: `app/api/tickets/scan/route.ts` (whole file)
- Modify: `app/private/scan/page.tsx:34-38`

**Interfaces:**
- Consumes: `signTicketToken`, `verifyTicketToken` from Task 1.
- Produces: `generateTicketPdf({ seatLabel, qrPayload, eventName, date, time, productionTheme })` — the `ticketId` parameter is **renamed to `qrPayload`**; the scan route now accepts `{ token: string }` instead of `{ ticketId: string }`.

**Issue — Finding 1a (Critical), continued.** Task 1 built the primitive; nothing uses it yet. Until the PDF carries a signature and the scanner demands one, the forgery path is still open.

**The fix:** sign at issue time in `sendTicketEmail` (which already owns the per-seat loop) and verify as the very first thing the scan route does, before any database access. Signing in `sendTicketEmail` rather than inside `generateTicketPdf` keeps the PDF renderer free of secrets and makes the data flow explicit at the call site. The scan route also fails loudly if the secret is missing — otherwise a misconfigured deploy would silently report *every* genuine ticket as invalid, which at a door is indistinguishable from a fraud wave.

- [ ] **Step 1: Change the PDF to encode an opaque payload**

In `lib/generateTicketPdf.ts`, rename the parameter in both the destructuring and the type (lines 17-31):

```ts
export async function generateTicketPdf({
  seatLabel,
  qrPayload,
  eventName,
  date,
  time,
  productionTheme,
}: {
  seatLabel: string;
  qrPayload: string;
  eventName: string;
  date: string;
  time: string;
  productionTheme: ProductionTheme | null;
}): Promise<Buffer> {
```

And at line 57, encode it:

```ts
    const qrBuffer = await QRCode.toBuffer(qrPayload, {
      width: qrSize,
      margin: 1,
      color: { dark: "#0a0a0a", light: "#f0f0f0" },
    });
```

- [ ] **Step 2: Sign each ticket when the email is built**

In `lib/sendTicketEmail.ts`, add the import at the top:

```ts
import { signTicketToken } from "./server/ticketToken";
```

and change the call inside the `seats.map` at line 30:

```ts
      const pdfBuffer = await generateTicketPdf({
        seatLabel,
        qrPayload: signTicketToken(seat.id),
        eventName,
        date,
        time,
        productionTheme,
      });
```

- [ ] **Step 3: Verify the signature in the scan route**

Replace the body of `app/api/tickets/scan/route.ts` with:

```ts
import { getDb, jsonResponse, errorResponse, requireAuth, parseBody } from "@/lib/server/api";
import { verifyTicketToken } from "@/lib/server/ticketToken";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  // A missing secret would make every genuine ticket read as "invalid" at the
  // door, which is indistinguishable from mass fraud. Fail loudly instead.
  if (!process.env.TICKET_QR_SECRET) {
    console.error("Scan rejected: TICKET_QR_SECRET is not configured");
    return errorResponse("Scanner is misconfigured. Contact the site owner.", 500);
  }

  try {
    const sql = getDb();
    const { token } = await parseBody<{ token: string }>(request);
    if (!token) return jsonResponse({ result: "invalid", message: "No ticket code provided" });

    const ticketId = verifyTicketToken(token);
    if (!ticketId) return jsonResponse({ result: "invalid", message: "Not a valid ticket code" });

    const rows = await sql`
      SELECT t.id, t.status, t.scanned_at, t.event_uuid, t.date_uuid,
             s."row" AS row, s.seat_number
      FROM tickets t JOIN seats s ON s.id = t.seat_id
      WHERE t.id = ${ticketId};
    `;
    const ticket = rows[0];
    if (!ticket) return jsonResponse({ result: "invalid", message: "Ticket not found" });
    if (ticket.status !== "sold") return jsonResponse({ result: "invalid", message: "Ticket is not valid" });
    if (ticket.scanned_at)
      return jsonResponse({ result: "already_scanned", message: "Already scanned",
        scanned_at: ticket.scanned_at, seat: `${ticket.row}${ticket.seat_number}` });

    await sql`UPDATE tickets SET scanned_at = ${new Date().toISOString()} WHERE id = ${ticketId};`;

    const events = await sql`SELECT title FROM events WHERE uuid = ${ticket.event_uuid};`;
    return jsonResponse({ result: "valid", message: "Valid ticket!",
      seat: `${ticket.row}${ticket.seat_number}`, event: (events[0] as Event | undefined)?.title });
  } catch (err) {
    console.error("Scan failed:", err);
    return jsonResponse({ result: "invalid", message: "Scan failed" });
  }
}
```

The `scanned_at` race and the performance scoping in this handler are deliberately left alone here — Tasks 7 and 8 fix them. This task changes only what the route accepts.

- [ ] **Step 4: Send the token from the scanner page**

In `app/private/scan/page.tsx`, change the fetch body at lines 34-38:

```tsx
          const res = await fetch("/api/tickets/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: decodedText }),
          });
```

- [ ] **Step 5: Verify the whole issue-and-scan loop by hand**

There is no automated coverage for PDF rendering or the DB path, so exercise it end to end:

1. `npm run test` — expected PASS. `npm run lint` — clean. `npm run build` — succeeds.
2. `npm run dev`, buy a ticket through Mollie test mode, and open the emailed PDF.
3. Scan it at `/private/scan` → **Valid ticket!**
4. Scan the same PDF again → **Already scanned**.
5. Take a raw ticket UUID straight from the database and render it as a QR (e.g. paste it into any QR generator), then scan that → **Not a valid ticket code**. This is the exploit from Finding 1a; it must now fail.

- [ ] **Step 6: Commit**

```bash
git add lib/generateTicketPdf.ts lib/sendTicketEmail.ts app/api/tickets/scan/route.ts app/private/scan/page.tsx
git commit -m "fix: sign ticket QR payloads and reject unsigned codes at the door"
```

---

## Task 3: Stop publishing ticket ids for seats nobody can buy

**Files:**
- Modify: `app/api/tickets/seats/route.ts:9-27`
- Modify: `types.tsx` (`SeatTicket`)
- Modify: `lib/seatSelection.ts:5,8-18,144-148`
- Modify: `app/event/[id]/ticket/[dateId]/checkout/page.tsx:106-112`
- Test: `lib/seatSelection.test.ts`

**Interfaces:**
- Produces: `SeatTicket.id: string | null` — `null` means "not purchasable, no handle issued". Consumed by the seat map and checkout pages.

**Issue — Finding 1b (Critical): the public seat map hands out every ticket id.**

`app/api/tickets/seats/route.ts:9-16` is unauthenticated and returns `t.id` for every row, including `sold` ones. That is what turns Finding 1a from theory into a one-request exploit, and it also gives an attacker the complete target list for the ticket-burning attack in Finding 4.

**The fix:** only issue an id for a seat the caller could legitimately put in a basket — `available`, or `held` with an expired hold. Everything else returns `id: null` and just enough to colour the seat map. The expired-hold case matters: the client already treats a lapsed hold as available (`lib/seatSelection.ts:76`), so withholding those ids would strand seats until the webhook released them. The `CASE` is evaluated in SQL against `now()` so the database clock decides, not the browser's.

Signing (Task 2) is what actually closes the forgery hole; this task is defence in depth — it removes the enumeration primitive so a future signing mistake is not immediately catastrophic.

- [ ] **Step 1: Write the failing tests**

Append to `lib/seatSelection.test.ts`:

```ts
describe("seats with withheld ids", () => {
  const sold: SeatTicket = {
    id: null, status: "sold", held_until: null,
    seat: { id: "s-sold", row: "A", seat_number: 5, reserved_for: null },
  };
  const free: SeatTicket = {
    id: "t-free", status: "available", held_until: null,
    seat: { id: "s-free", row: "A", seat_number: 6, reserved_for: null },
  };

  it("buildIndex keeps null-id seats out of ticketById", () => {
    const index = buildIndex([sold, free]);
    expect(Object.keys(index.ticketById)).toEqual(["t-free"]);
    expect(index.seatMap["A-5"].id).toBeNull();
  });

  it("a seat with no id is not selectable", () => {
    const index = buildIndex([sold, free]);
    expect(isSelectable(index, [], false, "A", 5)).toBe(false);
  });

  it("toggling a seat with no id is a no-op", () => {
    const index = buildIndex([sold, free]);
    expect(toggleSeat(index, ["t-free"], false, "A", 5)).toEqual(["t-free"]);
  });
});
```

Append it as a new top-level `describe` after the existing one. The file's imports at lines 1-3 already cover everything used here (`buildIndex`, `toggleSeat`, `isSelectable` from `@/lib/seatSelection`, and `type SeatTicket` from `@/types`) — no import changes needed.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/seatSelection.test.ts`
Expected: FAIL — TypeScript rejects `id: null` because `SeatTicket.id` is still `string`.

- [ ] **Step 3: Widen the type**

In `types.tsx`, in the `SeatTicket` interface:

```ts
export interface SeatTicket {
  /** null when the seat is not purchasable — the API withholds ids for sold/held seats. */
  id: string | null;
  status: TicketStatus;
  held_until: string | null;
  seat: { id: string; row: string; seat_number: number; reserved_for: string | null };
}
```

- [ ] **Step 4: Make the selection logic null-tolerant**

In `lib/seatSelection.ts`, change the `Cell` type at line 5:

```ts
type Cell = { id: string | null; status: string; reserved_for: string | null; held_until: string | null };
```

and guard the index build at lines 11-16:

```ts
  for (const t of tickets) {
    seatMap[`${t.seat.row}-${t.seat.seat_number}`] = {
      id: t.id, status: t.status, reserved_for: t.seat.reserved_for, held_until: t.held_until,
    };
    if (t.id) ticketById[t.id] = { row: t.seat.row, seatNum: t.seat.seat_number };
  }
```

and guard `toggleSeat` at lines 144-148:

```ts
export function toggleSeat(index: TicketIndex, selected: string[], multiRow: boolean, row: string, seatNum: number): string[] {
  const ticket = index.seatMap[`${row}-${seatNum}`];
  if (!ticket || !ticket.id || !isSelectable(index, selected, multiRow, row, seatNum)) return selected;

  const ticketId = ticket.id;
```

`isSelectable` needs no change: it reads `index.seatMap[...]?.id` into a nullable local and every path that dereferences it is already behind a truthiness check.

- [ ] **Step 5: Withhold the ids in the API**

Replace the query in `app/api/tickets/seats/route.ts` (lines 9-16):

```ts
    const rows = await sql`
      SELECT CASE
               WHEN t.status = 'available'
                 OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now())
               THEN t.id::text
               ELSE NULL
             END AS id,
             t.status, t.held_until,
             s.id AS seat_id, s."row" AS seat_row,
             s.seat_number, s.reserved_for
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      WHERE t.date_uuid = ${dateUuid};
    `;
```

The `.map` below it is unchanged — `r.id` is now sometimes `null`, which is exactly the new contract.

- [ ] **Step 6: Fix the one call site that assumed a non-null id**

In `app/event/[id]/ticket/[dateId]/checkout/page.tsx`, line 107:

```tsx
  const chosenSeats = seats
    .filter((t) => t.id !== null && ticketIds.includes(t.id))
```

`app/event/[id]/ticket/[dateId]/page.tsx:117-122` already handles a nullable id (`const ticketId = cell?.id;` then `Boolean(ticketId && …)`) and needs no edit.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npm run test` — expected PASS including the three new cases.
Run: `npm run lint` — clean.
Run: `npm run build` — succeeds (this catches any remaining `string | null` mismatch).

- [ ] **Step 8: Verify by hand**

With `npm run dev`, load a date that has at least one sold seat and check the payload:

```powershell
Invoke-RestMethod "http://localhost:3000/api/tickets/seats?date_uuid=<date-uuid>" |
  Group-Object status |
  ForEach-Object { "$($_.Name): $(($_.Group | Where-Object { $null -ne $_.id }).Count) of $($_.Count) carry an id" }
```

Expected: `sold: 0 of N carry an id`. Then open the seat map in a browser and confirm sold seats still render red and available seats are still selectable.

- [ ] **Step 9: Commit**

```bash
git add app/api/tickets/seats/route.ts types.tsx lib/seatSelection.ts lib/seatSelection.test.ts app/event/[id]/ticket/[dateId]/checkout/page.tsx
git commit -m "fix: withhold ticket ids for seats that cannot be purchased"
```

---

## Task 4: Atomic seat reservation, server-side seat rules, and order limits

**Files:**
- Create: `lib/server/checkoutValidation.ts`
- Test: `lib/server/checkoutValidation.test.ts`
- Modify: `app/api/tickets/checkout/route.ts` (whole file)

**Interfaces:**
- Produces: `validateCheckoutInput(body): { ok: true; value: CheckoutInput } | { ok: false; error: string }`, `isUuid(value: string): boolean`, `MAX_SEATS_PER_ORDER = 20`. `isUuid` is reused by Task 9.

**Issue — Finding 2 (Critical): the hold is a read-then-write race.**

`app/api/tickets/checkout/route.ts:29-38` `SELECT`s the seats, decides they are free, and then at line 41 issues an **unconditional** `UPDATE … SET status='held'`. Two requests that interleave between the read and the write both conclude the seat is free. Worse, line 72 sets `order_id` unconditionally, so the later order *takes the ticket rows away from the earlier one*. The damaging sequence:

1. Customer A holds A1 and is redirected to Mollie.
2. A's 10-minute hold lapses while their payment is still alive.
3. Customer B checks out A1 — the seat reads as free (`held_until < now`) — and `tickets.order_id` flips from A to B.
4. A pays. The webhook runs `UPDATE tickets … WHERE order_id = A` → **zero rows**. Order A is marked `paid` and `sendTicketEmail` is called with `seats: []`. A has been charged, has no seat, and receives a confirmation email with no PDF attached.

**Issue — Finding 7 (High): wheelchair seats are protected only in the browser.** `reserved_for` is enforced in `lib/seatSelection.ts:71-75` and nowhere else. `ticketIds` arrives from a URL query parameter (`checkout/page.tsx:32-35`), so editing the URL buys accessible seating — and equally bypasses every adjacency rule.

**Issue — Finding 8 (High): no cap on basket size.** `ticketIds` is unbounded, so a single request can hold the entire venue. Per the user's decision, the fix is a hard cap of **20 seats per order** and **no rate limiting**.

**Issue — Finding 13 (Medium): internal errors are echoed to the client.** Line 77 returns `err.message` verbatim, leaking Postgres and Mollie internals.

**Issue — Finding 12a (Medium): `name` and `email` are unvalidated.** Only the browser's `type="email"` stands between the attacker and the database, and there is no length bound at all.

**The fix:** one conditional statement does the whole reservation. Because Neon's HTTP driver cannot hold an interactive transaction, atomicity has to live in the `WHERE` clause — every precondition (right event, right date, not reserved, genuinely free by the *database* clock) becomes part of the same `UPDATE`, and `RETURNING t.id` reports how many seats were actually won. If that count is short, the caller lost the race and everything it grabbed is released by `order_id`, which is now assigned in the same statement rather than three statements later. The order row is created *before* the claim so that `order_id` is available to it; the compensating path deletes it. Validation moves into a pure, unit-tested module — and it must include a UUID-format check, because a malformed id would otherwise reach Postgres and raise `invalid input syntax for type uuid`.

- [ ] **Step 1: Write the failing validation tests**

Create `lib/server/checkoutValidation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateCheckoutInput, isUuid, MAX_SEATS_PER_ORDER } from "@/lib/server/checkoutValidation";

const uuid = (n: number) => `3f1a9c0e-5b2d-4e77-9a10-c3b8e6d45f${String(n).padStart(2, "0")}`;
const base = {
  eventUuid: "event-1", dateUuid: "date-1",
  ticketIds: [uuid(1), uuid(2)],
  name: "Ada Lovelace", email: "ada@example.com",
};

describe("isUuid", () => {
  it("accepts a canonical uuid and rejects anything else", () => {
    expect(isUuid(uuid(1))).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(`${uuid(1)} OR 1=1`)).toBe(false);
  });
});

describe("validateCheckoutInput", () => {
  it("accepts a well-formed order", () => {
    const result = validateCheckoutInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(1), uuid(2)]);
  });

  it("rejects a missing body", () => {
    expect(validateCheckoutInput(null).ok).toBe(false);
  });

  it("rejects each missing required field", () => {
    for (const key of ["eventUuid", "dateUuid", "name", "email"] as const) {
      expect(validateCheckoutInput({ ...base, [key]: "" }).ok).toBe(false);
    }
  });

  it("rejects an empty basket", () => {
    expect(validateCheckoutInput({ ...base, ticketIds: [] }).ok).toBe(false);
  });

  it(`rejects more than ${MAX_SEATS_PER_ORDER} seats`, () => {
    const tooMany = Array.from({ length: MAX_SEATS_PER_ORDER + 1 }, (_, i) => uuid(i));
    expect(validateCheckoutInput({ ...base, ticketIds: tooMany }).ok).toBe(false);
  });

  it(`accepts exactly ${MAX_SEATS_PER_ORDER} seats`, () => {
    const exact = Array.from({ length: MAX_SEATS_PER_ORDER }, (_, i) => uuid(i));
    expect(validateCheckoutInput({ ...base, ticketIds: exact }).ok).toBe(true);
  });

  it("deduplicates ticket ids so a repeated seat is billed once", () => {
    const result = validateCheckoutInput({ ...base, ticketIds: [uuid(1), uuid(1), uuid(2)] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ticketIds).toEqual([uuid(1), uuid(2)]);
  });

  it("rejects a ticket id that is not a uuid", () => {
    expect(validateCheckoutInput({ ...base, ticketIds: ["'; DROP TABLE tickets; --"] }).ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(validateCheckoutInput({ ...base, email: "ada[at]example.com" }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, email: "ada@example" }).ok).toBe(false);
  });

  it("rejects an over-long name and email", () => {
    expect(validateCheckoutInput({ ...base, name: "a".repeat(121) }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, email: `${"a".repeat(250)}@example.com` }).ok).toBe(false);
  });

  it("trims whitespace off name and email", () => {
    const result = validateCheckoutInput({ ...base, name: "  Ada  ", email: "  ada@example.com  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Ada");
      expect(result.value.email).toBe("ada@example.com");
    }
  });

  it("rejects non-string and non-array shapes", () => {
    expect(validateCheckoutInput({ ...base, ticketIds: "not-an-array" as never }).ok).toBe(false);
    expect(validateCheckoutInput({ ...base, name: 42 as never }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run lib/server/checkoutValidation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the validator**

Create `lib/server/checkoutValidation.ts`:

```ts
/**
 * Input validation for POST /api/tickets/checkout.
 *
 * Everything here is pure so it can be unit-tested without a database. The
 * uuid check is not cosmetic: `tickets.id` is a Postgres `uuid` column, so an
 * unvalidated value reaches the driver and raises `invalid input syntax for
 * type uuid`, which would surface as a 500.
 */

export const MAX_SEATS_PER_ORDER = 20;
export const MAX_NAME_LENGTH = 120;
export const MAX_EMAIL_LENGTH = 254;
const MAX_ID_LENGTH = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CheckoutInput {
  eventUuid: string;
  dateUuid: string;
  ticketIds: string[];
  name: string;
  email: string;
}

export type ValidationResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; error: string };

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

function nonEmptyString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

export function validateCheckoutInput(body: Partial<CheckoutInput> | null | undefined): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing request body" };

  const eventUuid = nonEmptyString(body.eventUuid, MAX_ID_LENGTH);
  const dateUuid = nonEmptyString(body.dateUuid, MAX_ID_LENGTH);
  if (!eventUuid || !dateUuid) return { ok: false, error: "Missing required fields" };

  const name = nonEmptyString(body.name, MAX_NAME_LENGTH);
  if (!name) return { ok: false, error: `Please enter a name of at most ${MAX_NAME_LENGTH} characters.` };

  const email = nonEmptyString(body.email, MAX_EMAIL_LENGTH);
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };

  if (!Array.isArray(body.ticketIds)) return { ok: false, error: "Missing required fields" };
  const ticketIds = [...new Set(body.ticketIds)];
  if (ticketIds.length === 0) return { ok: false, error: "Select at least one seat." };
  if (ticketIds.length > MAX_SEATS_PER_ORDER)
    return { ok: false, error: `You can book at most ${MAX_SEATS_PER_ORDER} seats in one order.` };
  if (!ticketIds.every(isUuid)) return { ok: false, error: "Invalid seat selection." };

  return { ok: true, value: { eventUuid, dateUuid, ticketIds, name, email } };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run lib/server/checkoutValidation.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Rewrite the checkout route**

Replace `app/api/tickets/checkout/route.ts` entirely:

```ts
import { getDb, jsonResponse, errorResponse, parseBody } from "@/lib/server/api";
import { eurosToCents } from "@/lib/server/ticketing";
import { getMollie } from "@/lib/server/mollie";
import { validateCheckoutInput, type CheckoutInput } from "@/lib/server/checkoutValidation";
import type { Event } from "@/types";

export async function POST(request: Request) {
  const sql = getDb();
  try {
    const parsed = validateCheckoutInput(await parseBody<Partial<CheckoutInput>>(request));
    if (!parsed.ok) return errorResponse(parsed.error, 400);
    const { eventUuid, dateUuid, ticketIds, name, email } = parsed.value;

    const events = await sql`SELECT * FROM events WHERE uuid = ${eventUuid};`;
    const event = events[0] as Event | undefined;
    if (!event) return errorResponse("Event not found", 404);
    if (event.tickets_open !== true) return errorResponse("Date not on sale", 404);
    const date = (event.dates ?? []).find((d) => d.uuid === dateUuid);
    if (!date || typeof date.price !== "number") return errorResponse("Date not on sale", 404);

    const totalCents = eurosToCents(date.price) * ticketIds.length;
    const totalEuros = (totalCents / 100).toFixed(2);

    // The order row is created first so its id can be written into the tickets
    // by the same statement that claims them.
    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${totalCents}, 'pending')
      RETURNING id;
    `;
    const orderId = created[0].id as string;

    const releaseAndDelete = async () => {
      await sql`
        UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
        WHERE order_id = ${orderId};
      `;
      await sql`DELETE FROM orders WHERE id = ${orderId};`;
    };

    // Single-statement claim. Neon's HTTP driver has no interactive
    // transactions, so every precondition lives in the WHERE clause and the
    // row count in RETURNING tells us whether we won the race. Times are
    // compared against the database clock, never the Node clock.
    const claimed = await sql`
      UPDATE tickets t
         SET status = 'held',
             held_until = now() + interval '10 minutes',
             order_id = ${orderId}
        FROM seats s
       WHERE s.id = t.seat_id
         AND t.id = ANY(${ticketIds})
         AND t.event_uuid = ${eventUuid}
         AND t.date_uuid = ${dateUuid}
         AND s.reserved_for IS NULL
         AND (t.status = 'available'
              OR (t.status = 'held' AND t.held_until IS NOT NULL AND t.held_until < now()))
      RETURNING t.id;
    `;

    if (claimed.length !== ticketIds.length) {
      await releaseAndDelete();
      return errorResponse("One or more seats are no longer available.", 409);
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const isLocal = baseUrl.includes("localhost");

    let payment;
    try {
      payment = await getMollie().payments.create({
        amount: { currency: "EUR", value: totalEuros },
        description: `${ticketIds.length} ticket${ticketIds.length > 1 ? "s" : ""} – ${event.title}`,
        redirectUrl: `${baseUrl}/event/${eventUuid}/ticket/${dateUuid}/confirm?order=${orderId}`,
        ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/tickets/webhook/mollie` }),
        metadata: { orderId },
      });
    } catch (mollieErr) {
      await releaseAndDelete();
      throw mollieErr;
    }

    await sql`UPDATE orders SET mollie_payment_id = ${payment.id} WHERE id = ${orderId};`;

    return jsonResponse({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    // Never echo driver or provider internals back to the browser.
    console.error("Checkout error:", err);
    return errorResponse("Checkout failed. Please try again.", 500);
  }
}
```

Two details that are easy to get wrong:
- `t.id = ANY(${ticketIds})` is written exactly as the original code was — the Neon driver already serialises a JS string array correctly here. Do **not** add a `::uuid[]` cast; the `isUuid` check in Step 3 is what keeps malformed values out.
- `UPDATE tickets t … FROM seats s WHERE s.id = t.seat_id` is the Postgres join-in-update form. `RETURNING t.id` returns one row per seat actually claimed.

- [ ] **Step 6: Prove the race is closed**

This is the one finding that cannot be demonstrated with a single request. Write a throwaway script at
`C:\Users\jelle\AppData\Local\Temp\claude\h--Projects-gentleman-productions\e042dbe8-41f6-4e20-90ff-e9f8333c247c\scratchpad\race.mjs`:

```js
// Fire N simultaneous checkouts for the SAME seat. Exactly one must win.
const [eventUuid, dateUuid, ticketId] = process.argv.slice(2);
const attempt = (i) =>
  fetch("http://localhost:3000/api/tickets/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventUuid, dateUuid, ticketIds: [ticketId],
      name: `Racer ${i}`, email: `racer${i}@example.com`,
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

const results = await Promise.all([...Array(8)].map((_, i) => attempt(i)));
const won = results.filter((r) => r.status === 200).length;
const lost = results.filter((r) => r.status === 409).length;
console.log(results);
console.log(`won=${won} lost=${lost}`);
if (won !== 1) throw new Error(`RACE NOT CLOSED: ${won} concurrent checkouts succeeded`);
```

With `npm run dev` running, pick an available ticket id from the seat map API and run:

```powershell
node "C:\Users\jelle\AppData\Local\Temp\claude\h--Projects-gentleman-productions\e042dbe8-41f6-4e20-90ff-e9f8333c247c\scratchpad\race.mjs" <eventUuid> <dateUuid> <ticketId>
```

Expected: `won=1 lost=7`. Then confirm no orphan orders were left behind:

```powershell
npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`SELECT count(*)::int AS orphans FROM orders o WHERE o.status='pending' AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id);`.then(r=>console.log(r))"
```

Expected: `orphans: 0` — the seven losers deleted their own order rows.

- [ ] **Step 7: Verify the other three findings in this task by hand**

```powershell
$body = @{ eventUuid="<uuid>"; dateUuid="<uuid>"; ticketIds=@("<21 available ids>"); name="Test"; email="t@example.com" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/tickets/checkout -ContentType application/json -Body $body
```

- 21 seats → `400` with "You can book at most 20 seats in one order." (Finding 8)
- A wheelchair seat id (row P, seats 1, 2, 28, 29) → `409` "One or more seats are no longer available." (Finding 7)
- `email="nope"` → `400` "Please enter a valid email address." (Finding 12a)
- Point `DATABASE_URL` at a bad host and retry → the response says "Checkout failed. Please try again." while the real cause appears only in the server console. (Finding 13)

Then run `npm run test`, `npm run lint`, `npm run build` — all green.

- [ ] **Step 8: Delete the throwaway script and commit**

```bash
git add lib/server/checkoutValidation.ts lib/server/checkoutValidation.test.ts app/api/tickets/checkout/route.ts
git commit -m "fix: claim seats atomically and validate checkout input server-side"
```

---

## Task 5: Idempotent, verified payment fulfilment

**Files:**
- Create: `lib/server/orderFulfillment.ts`
- Test: `lib/server/orderFulfillment.test.ts`
- Modify: `app/api/tickets/webhook/mollie/route.ts` (whole file)

**Interfaces:**
- Produces: `applyMolliePaymentToOrder(sql, paymentId): Promise<"paid" | "released" | "ignored">` and `paymentAmountMatchesOrder(paymentValue: string, orderTotalCents: number): boolean`. Task 9 calls `applyMolliePaymentToOrder` from the order-status route.

**Issue — Finding 3 (Critical): the webhook is not idempotent.**

`app/api/tickets/webhook/mollie/route.ts:18` runs `UPDATE orders SET status='paid' WHERE id = $1 RETURNING *`, which returns a row on *every* call. So the entire "mark sold → render PDFs → send email" path re-runs each time Mollie posts. Mollie retries webhooks by design and posts again on later status transitions, so this misfires in **normal operation** — customers receive their tickets two or three times. The endpoint is unauthenticated, so it is also replayable by anyone who learns a `tr_…` id.

**Issue — Finding 9 (Medium): the webhook trusts metadata without cross-checking the payment.** It never verifies `payment.id === order.mollie_payment_id`, nor that the amount paid equals the order total. Fetching the payment from Mollie rather than trusting the POST body is the right pattern and is already in place; the assertions are the missing half.

**The fix:** move fulfilment into one module that owns the state machine, and make the paid transition a *claim*: `WHERE id = $1 AND status <> 'paid' RETURNING *`. Zero rows means somebody already fulfilled this order, so return without sending anything. The ticket update gains `AND status = 'held'` for the same reason — otherwise a refunded ticket could be resurrected to `sold`. If a paid order claims zero tickets, that is the Finding 2 disaster signature (seats stolen by a later order); log it loudly and send no email rather than mailing a confirmation with no attachments.

Putting this in a module rather than the route is what makes Task 9 possible — the same function becomes the self-healing path when a webhook is never delivered.

- [ ] **Step 1: Write the failing test**

Create `lib/server/orderFulfillment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paymentAmountMatchesOrder } from "@/lib/server/orderFulfillment";

describe("paymentAmountMatchesOrder", () => {
  it("matches Mollie's decimal string against the stored cent total", () => {
    expect(paymentAmountMatchesOrder("18.00", 1800)).toBe(true);
    expect(paymentAmountMatchesOrder("22.50", 2250)).toBe(true);
    expect(paymentAmountMatchesOrder("0.01", 1)).toBe(true);
  });

  it("rejects an underpayment or overpayment", () => {
    expect(paymentAmountMatchesOrder("17.99", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("1.00", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("180.00", 1800)).toBe(false);
  });

  it("rejects unparseable amounts instead of treating them as zero", () => {
    expect(paymentAmountMatchesOrder("", 1800)).toBe(false);
    expect(paymentAmountMatchesOrder("free", 1800)).toBe(false);
  });

  it("is immune to floating point drift on large orders", () => {
    expect(paymentAmountMatchesOrder("360.00", 36000)).toBe(true);
    expect(paymentAmountMatchesOrder("446.70", 44670)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/server/orderFulfillment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the fulfilment module**

Create `lib/server/orderFulfillment.ts`:

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getMollie } from "./mollie";
import type { Event, Order } from "@/types";

type Sql = NeonQueryFunction<false, false>;

export type FulfillResult = "paid" | "released" | "ignored";

/** Mollie reports amounts as decimal strings; orders store integer cents. */
export function paymentAmountMatchesOrder(paymentValue: string, orderTotalCents: number): boolean {
  const parsed = Number.parseFloat(paymentValue);
  if (!Number.isFinite(parsed)) return false;
  return Math.round(parsed * 100) === orderTotalCents;
}

/**
 * Apply the current Mollie state of `paymentId` to its order.
 *
 * Safe to call any number of times for the same payment: the transition to
 * `paid` is claimed with a conditional UPDATE, so only the first caller ever
 * marks tickets sold or sends the email. Called by the Mollie webhook and, as
 * a self-healing fallback, by the order-status poll.
 */
export async function applyMolliePaymentToOrder(sql: Sql, paymentId: string): Promise<FulfillResult> {
  const payment = await getMollie().payments.get(paymentId);

  const orderId = (payment.metadata as { orderId?: string } | null)?.orderId;
  if (!orderId) {
    console.error(`Mollie payment ${paymentId} carries no orderId metadata`);
    return "ignored";
  }

  const orderRows = await sql`SELECT * FROM orders WHERE id = ${orderId};`;
  const order = orderRows[0] as Order | undefined;
  if (!order) {
    console.error(`Mollie payment ${paymentId} references unknown order ${orderId}`);
    return "ignored";
  }

  // The order records which payment is allowed to settle it.
  if (order.mollie_payment_id && order.mollie_payment_id !== payment.id) {
    console.error(
      `Payment/order mismatch: order ${orderId} expects ${order.mollie_payment_id}, got ${payment.id}`,
    );
    return "ignored";
  }

  if (payment.status === "paid") {
    if (!paymentAmountMatchesOrder(payment.amount.value, order.total_amount)) {
      console.error(
        `Amount mismatch on order ${orderId}: paid ${payment.amount.value}, expected ${order.total_amount} cents`,
      );
      return "ignored";
    }

    // Idempotency claim: zero rows means another call already fulfilled this.
    const claimed = await sql`
      UPDATE orders SET status = 'paid'
      WHERE id = ${orderId} AND status <> 'paid'
      RETURNING *;
    `;
    if (claimed.length === 0) return "ignored";
    const paidOrder = claimed[0] as Order;

    const soldTickets = await sql`
      UPDATE tickets SET status = 'sold', held_until = NULL
      WHERE order_id = ${orderId} AND status = 'held'
      RETURNING id, (SELECT "row" FROM seats WHERE seats.id = tickets.seat_id) AS row,
                    (SELECT seat_number FROM seats WHERE seats.id = tickets.seat_id) AS seat_number;
    `;

    if (soldTickets.length === 0) {
      // The order was paid but held no seats — they were taken by a later
      // order, or already released. Sending a ticketless confirmation would
      // make it worse; this needs a human (refund or reseat).
      console.error(
        `Order ${orderId} was paid but claimed no held tickets — seats lost, manual intervention required.`,
      );
      return "paid";
    }

    const events = await sql`SELECT * FROM events WHERE uuid = ${paidOrder.event_uuid};`;
    const event = events[0] as Event | undefined;
    const date = event?.dates?.find((d) => d.uuid === paidOrder.date_uuid);

    try {
      const { sendTicketEmail } = await import("@/lib/sendTicketEmail");
      await sendTicketEmail({
        order: paidOrder,
        eventName: event?.title ?? "Show",
        startTime: date?.start_time ?? null,
        productionTheme: event?.production_theme ?? null,
        seats: soldTickets.map((t) => ({ id: t.id, row: t.row, seat_number: t.seat_number })),
      });
    } catch (emailErr) {
      console.error(`Email send failed for order ${orderId}:`, emailErr);
    }

    return "paid";
  }

  if (["expired", "canceled", "failed"].includes(payment.status)) {
    await sql`
      UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
      WHERE order_id = ${orderId} AND status = 'held';
    `;
    await sql`UPDATE orders SET status = 'cancelled' WHERE id = ${orderId} AND status = 'pending';`;
    return "released";
  }

  return "ignored";
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/server/orderFulfillment.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Reduce the webhook to a thin caller**

Replace `app/api/tickets/webhook/mollie/route.ts` entirely:

```ts
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
```

- [ ] **Step 6: Verify idempotency by hand**

Webhooks are not delivered to `localhost` (`checkout/route.ts` omits `webhookUrl` when the base URL is local), so test this against a Vercel preview deployment, or expose the dev server with a tunnel and set `NEXT_PUBLIC_BASE_URL` to the tunnel URL.

1. Complete a test payment. Confirm exactly **one** email arrives with the right number of PDFs.
2. Replay the webhook by hand — this is the Finding 3 exploit:
   ```powershell
   Invoke-RestMethod -Method Post -Uri "<base-url>/api/tickets/webhook/mollie" -Body @{ id = "<tr_...>" }
   ```
   Repeat three times. Expected: HTTP 200 each time, and **no additional emails**. Before this task the same replay produced a fresh email every call.
3. Confirm the order and its tickets are unchanged:
   ```powershell
   npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`SELECT o.id, o.status, count(t.id)::int AS tickets FROM orders o LEFT JOIN tickets t ON t.order_id=o.id GROUP BY o.id, o.status ORDER BY o.id;`.then(r=>console.table(r))"
   ```
4. `npm run test`, `npm run lint`, `npm run build` — all green.

- [ ] **Step 7: Commit**

Include the `ADMIN_ROLE` finding from Task 0 Step 2 in the commit body so it is recorded in history.

```bash
git add lib/server/orderFulfillment.ts lib/server/orderFulfillment.test.ts app/api/tickets/webhook/mollie/route.ts
git commit -m "fix: make Mollie fulfilment idempotent and verify payment against the order"
```

---

# Stage 2 — High

## Task 6: Restrict the scanner and the order summary to admins

**Files:**
- Create: `lib/server/requireAdminPage.ts`
- Create: `app/private/scan/layout.tsx`
- Create: `app/private/tickets/layout.tsx`
- Modify: `app/api/tickets/scan/route.ts:1,5-6`
- Modify: `app/api/tickets/summary/route.ts:1,4-5`

**Interfaces:**
- Consumes: the `ADMIN_ROLE` literal confirmed in Task 0.
- Produces: `requireAdminPage(): Promise<void>` — server-component guard that calls `redirect()` for non-admins.

**Issue — Finding 4 (High): any logged-in account can burn every ticket in the venue.**

`app/api/tickets/scan/route.ts:5` uses `requireAuth`, which accepts *any* valid token regardless of role. The endpoint writes `scanned_at`, and Task 2 aside, ticket ids remain discoverable to anyone who was ever issued one. A single low-privilege account can therefore POST ids in a loop and mark tickets scanned, so that genuine holders are refused at the door. There is no role check and no second factor.

**Issue — Finding 14 (Medium): customer PII is exposed to every role.** `app/api/tickets/summary/route.ts:16-20` returns 100 customers' names and email addresses behind `requireAuth` alone. `app/private/layout.tsx:24-30` verifies the token and explicitly ignores `decoded.role` (there is even a comment noting the omission).

**The fix:** `requireRole(request, [ADMIN_ROLE])` on both routes — the helper already exists at `lib/server/api.ts:117` and returns 403 for the wrong role. The pages get a matching server-side guard so a non-admin is redirected rather than shown a broken screen. The guard is applied to the two sensitive route segments **only** — `app/private/layout.tsx` stays as it is, because `/private/about` and `/private/posts` are legitimately used by `CREATE_ONLY` accounts and elevating the shared layout would lock them out of their own editor.

- [ ] **Step 1: Write the page guard**

Create `lib/server/requireAdminPage.ts`:

```ts
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server-component guard for admin-only pages under /private.
 *
 * Applied per route segment rather than on app/private/layout.tsx, because
 * CREATE_ONLY accounts legitimately use /private/about and /private/posts.
 */
export async function requireAdminPage(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
}
```

Replace `"ADMIN"` with the literal confirmed in Task 0 Step 2 if it differs.

- [ ] **Step 2: Apply it to both pages**

Create `app/private/scan/layout.tsx`:

```tsx
import { requireAdminPage } from "@/lib/server/requireAdminPage";

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
```

Create `app/private/tickets/layout.tsx`:

```tsx
import { requireAdminPage } from "@/lib/server/requireAdminPage";

export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
```

- [ ] **Step 3: Gate the scan API**

In `app/api/tickets/scan/route.ts`, change the import on line 1 and the guard on lines 5-6:

```ts
import { getDb, jsonResponse, errorResponse, requireRole, parseBody } from "@/lib/server/api";
```

```ts
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;
```

- [ ] **Step 4: Gate the summary API**

In `app/api/tickets/summary/route.ts`, change lines 1 and 4-5:

```ts
import { getDb, jsonResponse, requireRole } from "@/lib/server/api";
```

```ts
  const authError = requireRole(request, ["ADMIN"]);
  if (authError) return authError;
```

- [ ] **Step 5: Verify both roles**

`npm run dev`, then:

1. Log in as the **admin** account. `/private/scan` loads and scanning works. `/private/tickets` loads with data.
2. Log in as a **non-admin** (create one temporarily with `role='CREATE_ONLY'` if none exists). `/private/scan` and `/private/tickets` both redirect to `/`. `/private/posts` still works — confirm you have not locked editors out of their own tools.
3. As the non-admin, hit the APIs directly — this is the Finding 4 exploit:
   ```powershell
   Invoke-WebRequest -Method Post -Uri http://localhost:3000/api/tickets/scan -ContentType application/json -Body '{"token":"x"}' -WebSession $s
   Invoke-WebRequest -Uri http://localhost:3000/api/tickets/summary -WebSession $s
   ```
   Expected: `403 Forbidden` on both. Logged out: `401 Unauthorized`.
4. `npm run lint` and `npm run build` — clean.

- [ ] **Step 6: Commit**

```bash
git add lib/server/requireAdminPage.ts app/private/scan/layout.tsx app/private/tickets/layout.tsx app/api/tickets/scan/route.ts app/api/tickets/summary/route.ts
git commit -m "fix: restrict ticket scanning and the order summary to admins"
```

---

## Task 7: Claim the scan atomically

**Files:**
- Modify: `app/api/tickets/scan/route.ts` (handler body)

**Issue — Finding 6 (High): two doors can admit the same ticket.**

The handler reads `scanned_at` at line 22 and writes it at line 26. Two scanners pointed at the same QR at the same moment both read `null`, both fall through the `already_scanned` branch, and both report **valid** — the ticket is used twice. The window is small but it is exactly the situation a busy two-door venue creates, and it is the one case where the failure hands out a free admission.

**The fix:** the same pattern as Task 4 — make the write itself the test. `UPDATE … WHERE scanned_at IS NULL RETURNING scanned_at` returns one row for the scanner that won and zero rows for the one that lost, so the loser reports `already_scanned` correctly. The lookup query also picks up the event title via a `LEFT JOIN`, which removes the separate `SELECT … FROM events` at the end of the old handler.

- [ ] **Step 1: Restructure the handler**

In `app/api/tickets/scan/route.ts`, replace everything from the `const rows = await sql\`` lookup down to the final `return jsonResponse({ result: "valid", … })`:

```ts
    const rows = await sql`
      SELECT t.id, t.status, t.scanned_at, t.event_uuid, t.date_uuid,
             s."row" AS row, s.seat_number,
             e.title AS event_title
      FROM tickets t
      JOIN seats s ON s.id = t.seat_id
      LEFT JOIN events e ON e.uuid = t.event_uuid
      WHERE t.id = ${ticketId};
    `;
    const ticket = rows[0];
    if (!ticket) return jsonResponse({ result: "invalid", message: "Ticket not found" });

    const seat = `${ticket.row}${ticket.seat_number}`;
    if (ticket.status !== "sold")
      return jsonResponse({ result: "invalid", message: "Ticket is not valid", seat });

    // The update is the test: exactly one concurrent scanner gets a row back.
    const claimed = await sql`
      UPDATE tickets SET scanned_at = now()
      WHERE id = ${ticketId} AND status = 'sold' AND scanned_at IS NULL
      RETURNING scanned_at;
    `;

    if (claimed.length === 0) {
      const current = await sql`SELECT scanned_at FROM tickets WHERE id = ${ticketId};`;
      return jsonResponse({
        result: "already_scanned",
        message: "Already scanned",
        scanned_at: current[0]?.scanned_at ?? ticket.scanned_at,
        seat,
      });
    }

    return jsonResponse({
      result: "valid",
      message: "Valid ticket!",
      seat,
      event: ticket.event_title ?? undefined,
    });
```

The `import type { Event } from "@/types";` line at the top is now unused — delete it, or `npm run lint` will flag it.

- [ ] **Step 2: Verify the race is closed**

Scan a valid ticket once → **Valid ticket!**; scan it again → **Already scanned** with the correct timestamp. Then fire concurrent scans of the same token:

```powershell
$token = "<paste the QR payload from a fresh unscanned ticket PDF>"
$body  = @{ token = $token } | ConvertTo-Json
1..6 | ForEach-Object -Parallel {
  (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/tickets/scan `
     -ContentType application/json -Body $using:body -WebSession $using:s).result
} | Group-Object | Format-Table Name, Count
```

Expected: `valid: 1`, `already_scanned: 5`. Before this task, several could come back `valid`.

Then `npm run lint` and `npm run build` — clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/tickets/scan/route.ts
git commit -m "fix: claim ticket scans atomically so a QR cannot be admitted twice"
```

---

## Task 8: Scope scanning to one performance and tell staff when the date is wrong

**Files:**
- Modify: `app/api/tickets/scan/route.ts` (request body + date check)
- Modify: `app/private/scan/page.tsx` (whole file)
- Modify: `app/private/scan/Scan.module.css` (append)

**Interfaces:**
- Consumes: `GET /api/tickets/summary` (admin-only after Task 6) for the performance list — it already returns `{ event_uuid, date_uuid, title, start_time }` per ticketed date, so no new endpoint is needed.
- Produces: scan request body `{ token: string; dateUuid: string }`; response `result` gains the value `"wrong_date"`.

**Issue — Finding 5 (High): the scanner never checks which performance the ticket is for.**

`app/api/tickets/scan/route.ts` validates status and scanned-state but never looks at `ticket.date_uuid`. A ticket for Friday scans green at Saturday's door as long as it is unscanned. Since prices are per date, a customer can buy the cheapest performance and attend any other — and the run's seat accounting silently drifts, because Friday's seat is marked used on Saturday night.

**The fix (per the user's requirement):** the operator picks the performance they are staffing before the camera starts, and the route rejects tickets belonging to any other date. Crucially, the rejection is **informative rather than a flat "invalid"** — the response carries the performance the ticket *is* valid for, so door staff can tell the visitor "you're booked for Friday the 14th" instead of turning them away with an unexplained red screen. A wrong-date ticket is explicitly **not** marked scanned, so the holder can still use it on their real night.

Implementation notes that matter:
- The `html5-qrcode` decode callback is created once when the camera starts and would capture a stale `dateUuid` in its closure. The selected date is therefore held in a **ref**, read at decode time, so changing the performance mid-shift takes effect without restarting the camera.
- The choice is persisted in `localStorage` so a page reload at the door does not lose it.
- The camera does not start until a performance is chosen — a scanner that cannot say what it is scanning for should not be scanning.

- [ ] **Step 1: Enforce the date in the API**

In `app/api/tickets/scan/route.ts`, change the body parse and add the check immediately after the `status !== "sold"` guard from Task 7:

```ts
    const { token, dateUuid } = await parseBody<{ token: string; dateUuid: string }>(request);
    if (!token) return jsonResponse({ result: "invalid", message: "No ticket code provided" });
    if (!dateUuid)
      return jsonResponse({ result: "invalid", message: "No performance selected on this scanner" });
```

Then insert the date check **between the `status !== "sold"` guard and the atomic `UPDATE`** from Task 7. Placement is the whole point: it must run before the claim, or a wrong-date ticket gets consumed before it is rejected.

```ts
    if (ticket.date_uuid !== dateUuid) {
      // Not marked scanned — the ticket is still good for its own night.
      const ticketDate = (ticket.event_dates as { uuid: string; start_time: string }[] | null)
        ?.find((d) => d.uuid === ticket.date_uuid)?.start_time ?? null;
      return jsonResponse({
        result: "wrong_date",
        message: "Wrong performance",
        seat,
        event: ticket.event_title ?? undefined,
        ticket_date: ticketDate,
      });
    }
```

The lookup query needs one more column for that — add `e.dates AS event_dates` to the `SELECT` list written in Task 7:

```ts
             e.title AS event_title, e.dates AS event_dates
```

- [ ] **Step 2: Rewrite the scanner page**

Replace `app/private/scan/page.tsx` entirely:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import styles from "./Scan.module.css";

interface ScanResult {
  result: "valid" | "already_scanned" | "wrong_date" | "invalid";
  message: string;
  seat?: string;
  event?: string;
  scanned_at?: string;
  ticket_date?: string | null;
}

interface Performance {
  event_uuid: string;
  date_uuid: string;
  title: string;
  start_time: string | null;
}

const STORAGE_KEY = "gp.scanner.dateUuid";

function formatPerformance(p: Performance): string {
  if (!p.start_time) return `${p.title} — date unknown`;
  const d = new Date(p.start_time);
  if (Number.isNaN(d.getTime())) return `${p.title} — date unknown`;
  return `${p.title} — ${d.toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })}`;
}

export default function ScanPage() {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [dateUuid, setDateUuid] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const processingRef = useRef(false);
  // Read at decode time so changing the performance does not need a restart.
  const dateUuidRef = useRef("");

  useEffect(() => {
    dateUuidRef.current = dateUuid;
    if (dateUuid) localStorage.setItem(STORAGE_KEY, dateUuid);
  }, [dateUuid]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tickets/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load performances");
        return res.json();
      })
      .then((data: { dates: Performance[] }) => {
        if (cancelled) return;
        const sorted = [...(data.dates ?? [])].sort((a, b) =>
          (a.start_time ?? "").localeCompare(b.start_time ?? ""),
        );
        setPerformances(sorted);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && sorted.some((p) => p.date_uuid === stored)) setDateUuid(stored);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the performance list. Reload the page.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasDate = Boolean(dateUuid);

  useEffect(() => {
    if (!hasDate || startedRef.current) return;
    startedRef.current = true;

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (processingRef.current) return;
          processingRef.current = true;

          try {
            const res = await fetch("/api/tickets/scan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: decodedText, dateUuid: dateUuidRef.current }),
            });
            const data = (await res.json()) as ScanResult;
            setResult(data);
          } catch {
            setResult({ result: "invalid", message: "Scanner offline — check the connection" });
          }
          setScanning(false);

          setTimeout(() => {
            setResult(null);
            setScanning(true);
            processingRef.current = false;
          }, 3000);
        },
        () => {},
      )
      .then(() => setScanning(true))
      .catch(() => setError("Camera access denied. Please allow camera permissions and reload."));

    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, [hasDate]);

  const bgClass = !result
    ? styles.idle
    : result.result === "valid"
      ? styles.valid
      : result.result === "already_scanned"
        ? styles.alreadyScanned
        : result.result === "wrong_date"
          ? styles.wrongDate
          : styles.invalid;

  const icon =
    result?.result === "valid" ? "✅"
    : result?.result === "already_scanned" ? "⚠️"
    : result?.result === "wrong_date" ? "📅"
    : "❌";

  return (
    <main className={`${styles.page} ${bgClass}`}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Door Scanner</h1>

      {error && <p className={styles.error}>{error}</p>}

      {!result && (
        <div className={styles.picker}>
          <label htmlFor="performance" className={styles.pickerLabel}>
            Performance being scanned
          </label>
          <select
            id="performance"
            className={styles.select}
            value={dateUuid}
            onChange={(e) => setDateUuid(e.target.value)}
          >
            <option value="">Select a performance…</option>
            {performances.map((p) => (
              <option key={p.date_uuid} value={p.date_uuid}>
                {formatPerformance(p)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div id="qr-reader" className={`${styles.reader} ${result || !hasDate ? styles.readerHidden : ""}`} />

      {!hasDate && !error && (
        <p className={styles.hint}>Choose the performance above to start scanning.</p>
      )}
      {hasDate && scanning && !result && <p className={styles.hint}>Point camera at QR code</p>}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultIcon}>{icon}</div>
          <h2 className={styles.resultMessage}>{result.message}</h2>
          {result.seat && <p className={styles.resultSeat}>Seat {result.seat}</p>}
          {result.result === "wrong_date" && (
            <p className={styles.resultDetail}>
              This ticket is for{" "}
              {result.ticket_date
                ? new Date(result.ticket_date).toLocaleString("en-GB", {
                    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
                  })
                : "another performance"}
              {result.event ? ` (${result.event})` : ""}. Send them to that performance — this ticket
              has not been used up.
            </p>
          )}
          {result.result === "already_scanned" && result.scanned_at && (
            <p className={styles.resultScannedAt}>
              Scanned at {new Date(result.scanned_at).toLocaleTimeString()}
            </p>
          )}
          <p className={styles.resultResuming}>Resuming in 3 seconds...</p>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Add the styles**

Append to `app/private/scan/Scan.module.css`:

```css
.wrongDate {
  background: #4c1d95;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 20px;
  width: 300px;
}

.pickerLabel {
  font-family: var(--font-deco);
  color: var(--cream-muted);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.select {
  font-family: var(--font-body);
  font-size: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--gray-800);
  background: var(--noir);
  color: var(--cream);
}

.resultDetail {
  font-size: 14px;
  line-height: 1.6;
  opacity: 0.85;
  margin: 12px auto 0;
  max-width: 320px;
}
```

- [ ] **Step 4: Verify the wrong-date path**

You need two ticketed dates with a sold ticket on each. With `npm run dev`, logged in as admin:

1. Open `/private/scan`. The camera stays dark and the hint reads "Choose the performance above to start scanning."
2. Pick performance **A**. The camera starts.
3. Scan a ticket for **A** → green, **Valid ticket!**
4. Scan a ticket for **B** → purple, **Wrong performance**, and the detail line names B's date and title.
5. Confirm the B ticket was *not* consumed:
   ```powershell
   npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`SELECT id, scanned_at FROM tickets WHERE id='<ticket-b-id>';`.then(r=>console.table(r))"
   ```
   Expected: `scanned_at` is still `null`. This is the point of the fix — a visitor at the wrong door keeps their ticket.
6. Switch the picker to **B** without reloading, scan the same B ticket → green. This proves the ref-based date is read at decode time and not captured stale.
7. Reload the page → the picker still shows B (localStorage).
8. `npm run lint` and `npm run build` — clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/tickets/scan/route.ts app/private/scan/page.tsx app/private/scan/Scan.module.css
git commit -m "feat: scope door scanning to one performance with wrong-date feedback"
```

---

# Stage 3 — Medium

## Task 9: Self-heal orders when the webhook never arrives

**Files:**
- Modify: `app/api/tickets/orders/[id]/route.ts` (whole file)

**Interfaces:**
- Consumes: `applyMolliePaymentToOrder` from Task 5, `isUuid` from Task 4.

**Issue — Finding 10 (Medium): payment status is only ever set by the webhook.**

Nothing else transitions an order. If Mollie's callback is dropped, delayed past the customer's patience, or the deployment is briefly down, the order stays `pending` forever: the customer has been charged, the seats sit in `held`, no email is sent, and no code path will ever fix it. There is no reconciliation and no alert — the failure is completely silent.

**The fix:** the confirm page already polls this endpoint every 1.5 seconds. Make that poll do real work — when an order is still `pending` and has a payment id, ask Mollie for the authoritative status and run the same idempotent fulfilment the webhook uses. Because Task 5 made fulfilment claim-based, the poll and a late webhook can both run without double-sending anything. A failed reconciliation is logged and swallowed so the endpoint still answers with the last known status.

`isUuid` guards the path parameter: `orders.id` is a `uuid` column, so a non-UUID would otherwise reach the driver and turn into a 500 instead of a 404.

- [ ] **Step 1: Rewrite the route**

Replace `app/api/tickets/orders/[id]/route.ts` entirely:

```ts
import { getDb, jsonResponse, errorResponse, getPathId } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { applyMolliePaymentToOrder } from "@/lib/server/orderFulfillment";

export async function GET(request: Request) {
  const id = getPathId(request);
  if (!id) return errorResponse("ID is required", 400);
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const sql = getDb();
  try {
    const rows = await sql`SELECT id, status, mollie_payment_id FROM orders WHERE id = ${id};`;
    if (rows.length === 0) return errorResponse("Order not found", 404);
    const order = rows[0] as { id: string; status: string; mollie_payment_id: string | null };

    // The webhook is the primary path, but it can be dropped or delayed. The
    // confirm page polls this endpoint, so use it to reconcile: fulfilment is
    // idempotent, so a late webhook afterwards is harmless.
    if (order.status === "pending" && order.mollie_payment_id) {
      try {
        await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
        const refreshed = await sql`SELECT status FROM orders WHERE id = ${id};`;
        return jsonResponse({ status: (refreshed[0]?.status as string) ?? order.status });
      } catch (reconcileErr) {
        console.error(`Reconciliation failed for order ${id}:`, reconcileErr);
      }
    }

    return jsonResponse({ status: order.status });
  } catch (err) {
    console.error("Failed to load order:", err);
    return errorResponse("Failed to load order", 500);
  }
}
```

- [ ] **Step 2: Verify reconciliation actually recovers a dropped webhook**

Simulate the failure this fix exists for. With `npm run dev` (where `webhookUrl` is never registered, so **no** webhook is delivered at all — a perfect stand-in for a dropped callback):

1. Complete a Mollie test payment. The order will be `pending` with a `mollie_payment_id`.
2. Poll the endpoint:
   ```powershell
   Invoke-RestMethod "http://localhost:3000/api/tickets/orders/<order-id>"
   ```
   Expected: `status = paid` on the first call — the endpoint reconciled it — and the ticket email arrives.
3. Call it three more times. Expected: `status = paid` each time and **no further emails** (Task 5's claim holds).
4. Confirm the seats moved:
   ```powershell
   npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`SELECT status, count(*)::int FROM tickets WHERE order_id='<order-id>' GROUP BY status;`.then(r=>console.table(r))"
   ```
   Expected: all `sold`.
5. `Invoke-RestMethod "http://localhost:3000/api/tickets/orders/not-a-uuid"` → 404, not 500.
6. `npm run test`, `npm run lint`, `npm run build` — green.

- [ ] **Step 3: Commit**

```bash
git add app/api/tickets/orders/[id]/route.ts
git commit -m "fix: reconcile pending orders against Mollie when the webhook is missed"
```

---

## Task 10: Stop telling paying customers their seats were released

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/confirm/page.tsx:20-67`

**Issue — Finding 11 (Medium): the confirm page reports a false negative.**

The poll gives up after 10 attempts at 1.5s — **15 seconds** — and then renders *"Payment not completed — Your seats have been released"* for **any** status that is not `paid`, including `pending`. Webhook delivery routinely takes longer than 15 seconds. A customer who has just been charged is told their money did nothing and their seats are gone, which drives duplicate purchases and support load. It is the only place in the flow where the site states something factually wrong to the person who just paid.

**The fix:** three distinct states instead of two. `paid` → success. `cancelled` → the honest "released" message. Still `pending` after the timeout → tell them it is confirming and the email is coming, and do **not** claim the seats were released. The poll also fires immediately rather than idling 1.5s first, and runs for 30 seconds now that each poll does reconciliation work (Task 9).

- [ ] **Step 1: Rewrite the polling and the three states**

In `app/event/[id]/ticket/[dateId]/confirm/page.tsx`, replace everything inside `ConfirmContent` from the two `useState` declarations (lines 17-18) down to the end of the returned JSX:

```tsx
  const [status, setStatus] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/tickets/orders/${orderId}`);
        const data = (await res.json()) as { status?: string };
        if (cancelled) return;
        if (data.status && data.status !== "pending") {
          setStatus(data.status);
          return;
        }
      } catch {
        // Network hiccup — keep polling until the attempt budget runs out.
      }
      if (attempts >= 20) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, 1500);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId]);

  if (!status && !timedOut) {
    return (
      <main className={styles.page}>
        <p className={styles.status}>Confirming your payment...</p>
      </main>
    );
  }

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

  if (status === "cancelled") {
    return (
      <main className={styles.page}>
        <p className={styles.eyebrow}>Gentleman Productions</p>
        <h1 className={styles.title}>Payment not completed</h1>
        <p className={styles.copy}>Your seats have been released. You can go back and try again.</p>
        <Link href={`/event/${id}`} className={styles.backLink}>
          &larr; Back to event
        </Link>
      </main>
    );
  }

  // Still pending: the payment may well have succeeded and simply not been
  // confirmed yet. Never claim the seats were released here.
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Still confirming</h1>
      <p className={styles.copy}>
        Your payment is being confirmed. If it went through, your tickets will arrive by email
        shortly — you don&rsquo;t need to pay again. Contact us if nothing arrives within an hour.
      </p>
      <Link href={`/event/${id}`} className={styles.backLink}>
        &larr; Back to event
      </Link>
    </main>
  );
```

Delete the now-unused local `Order` type at the top of the file.

- [ ] **Step 2: Verify all three states**

1. **paid** — complete a Mollie test payment → "You're in!"
2. **cancelled** — start a checkout and cancel at Mollie, then wait for the status to settle (or set it directly):
   ```powershell
   npx tsx --env-file=.env.local -e "const {neon}=require('@neondatabase/serverless');const sql=neon(process.env.DATABASE_URL);sql`UPDATE orders SET status='cancelled' WHERE id='<order-id>';`.then(()=>console.log('ok'))"
   ```
   Reload the confirm page → "Payment not completed / Your seats have been released."
3. **pending** — visit `/event/<id>/ticket/<dateId>/confirm?order=<an order with no mollie_payment_id>`. After ~30s it must read **"Still confirming"** and must *not* say the seats were released. This is the exact regression Finding 11 describes.
4. `npm run lint` and `npm run build` — clean.

- [ ] **Step 3: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/confirm/page.tsx"
git commit -m "fix: distinguish pending from cancelled on the payment confirm page"
```

---

## Task 11: Escape interpolated values in the ticket email

**Files:**
- Modify: `lib/text.ts` (append)
- Test: `lib/text.test.ts` (create if absent)
- Modify: `lib/sendTicketEmail.ts:38-101`

**Interfaces:**
- Produces: `escapeHtml(value: string): string` in `lib/text.ts`.

**Issue — Finding 12b (Medium): customer-supplied text is interpolated raw into HTML.**

`lib/sendTicketEmail.ts:55` writes `Hi ${order.customer_name}` straight into the email body, and `eventName` and `seatList` are interpolated the same way. `customer_name` is attacker-controlled at checkout. Task 4 bounded its length and trimmed it, but never made it safe to *render* — a name containing `<a href="…">` or a closing tag still lands verbatim in an email the site sends under its own domain. The blast radius is limited (the message goes to the buyer's own address), but the same string is rendered again in the admin summary table at `app/private/tickets/page.tsx:137`, and "our transactional email renders arbitrary HTML from a form field" is not a property to leave standing.

**The fix:** escape at the point of interpolation. Validation (Task 4) and escaping (here) are complementary — validation decides what may be stored, escaping decides how it is rendered, and neither substitutes for the other. Every interpolated value in the template gets escaped, not just the obviously hostile one, so a future edit that adds a field inherits the safe pattern.

- [ ] **Step 1: Write the failing test**

Create `lib/text.test.ts` (or append the `describe` block if the file already exists):

```ts
import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/text";

describe("escapeHtml", () => {
  it("escapes every character that can break out of HTML text", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(escapeHtml(`Tom & "Jerry" O'Brien`)).toBe(
      "Tom &amp; &quot;Jerry&quot; O&#39;Brien",
    );
  });

  it("escapes ampersands first so entities are not double-broken", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Ada Lovelace")).toBe("Ada Lovelace");
    expect(escapeHtml("")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run lib/text.test.ts`
Expected: FAIL — `escapeHtml` is not exported.

- [ ] **Step 3: Implement it**

Append to `lib/text.ts`:

```ts
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for interpolation into HTML text or an attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
```

The single regex pass handles `&` correctly — a replacement is never re-scanned, so `&lt;` becomes `&amp;lt;` rather than `&amp;amp;lt;`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run lib/text.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Escape every interpolation in the email**

In `lib/sendTicketEmail.ts`, add the import:

```ts
import { escapeHtml } from "./text";
```

Then, just above the `const html = \`` template (after the `seatList` definition at line 38), build the escaped values:

```ts
  const seatList = seats.map((s) => `${s.row}${s.seat_number}`).join(", ");

  // Everything below is interpolated into HTML; customer_name in particular is
  // free-form input from the checkout form.
  const safeName = escapeHtml(order.customer_name);
  const safeEventName = escapeHtml(eventName);
  const safeSeatList = escapeHtml(seatList);
  const safeDate = escapeHtml(date);
  const safeTime = escapeHtml(time);
```

and replace the five interpolations in the template:

- line 55: `Hi ${safeName}, your seats are reserved.`
- line 63: `>${safeEventName}</p>`
- line 64: `>${safeDate} &nbsp;·&nbsp; ${safeTime}</p>`
- line 69: `>${safeSeatList}</p>`

The `subject` line at line 106 is a header, not HTML — leave it using the raw `eventName` and `date`.

- [ ] **Step 6: Verify**

Place a test order with the name `<b>Ada</b> & "Friends"` and complete payment. The received email must display that name **literally**, with no bold rendering. Confirm the PDFs still attach and the seat list still reads correctly.

Then `npm run test`, `npm run lint`, `npm run build` — green.

- [ ] **Step 7: Commit**

```bash
git add lib/text.ts lib/text.test.ts lib/sendTicketEmail.ts
git commit -m "fix: HTML-escape customer-supplied values in ticket emails"
```

---

## Final verification

After Task 11, run the full flow once end to end on a preview deployment with production-shaped configuration:

- [ ] `npm run test` — all suites pass.
- [ ] `npm run lint` — clean.
- [ ] `npm run build` — succeeds.
- [ ] `TICKET_QR_SECRET` is set in Vercel for Production **and** Preview, identical values.
- [ ] Buy 2 seats → pay → exactly one email with 2 PDFs.
- [ ] Scan both PDFs at the correct performance → both valid. Re-scan → both `already_scanned`.
- [ ] Scan one at a different performance → `wrong_date`, and `scanned_at` stays null.
- [ ] A raw ticket UUID rendered as a QR → rejected.
- [ ] `/api/tickets/seats` returns no ids for sold seats.
- [ ] A non-admin account gets 403 from `/api/tickets/scan` and `/api/tickets/summary`, and is redirected away from `/private/scan` and `/private/tickets`, while `/private/posts` still works for `CREATE_ONLY`.
- [ ] 21 seats in one basket → 400. A wheelchair seat → 409.
- [ ] Replaying the Mollie webhook sends no second email.

Findings deliberately left open (documented, not fixed): the provisioning loop's per-seat round-trips, the stale-`held` rows that inflate admin counts, and the CSP's `unsafe-inline`/`unsafe-eval`. Rate limiting was excluded by explicit decision.
