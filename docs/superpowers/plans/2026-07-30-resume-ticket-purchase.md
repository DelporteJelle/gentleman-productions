# Resume & re-view a ticket purchase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist in the browser the orders it created, so a visitor can continue an unpaid reservation, retry a failed payment, or re-download a completed purchase — and so a payment whose redirect was lost becomes visible instead of silent.

**Architecture:** `localStorage` holds a versioned list of order ids this browser created (durable user data); the server remains the only authority on order *status*, fetched per-id through the existing React Query provider. A new `payment_started_at` column re-anchors the existing one-hour seat-protection window to the latest payment attempt, and a new `resumeOrder` server function reuses or re-mints a Mollie payment on the *same* order id.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, Neon serverless Postgres (HTTP driver, no interactive transactions), Mollie `@mollie/api-client` v4, TanStack Query v5, Vitest, CSS Modules.

## Global Constraints

- **Spec:** [docs/superpowers/specs/2026-07-30-resume-ticket-purchase-design.md](../specs/2026-07-30-resume-ticket-purchase-design.md). Read it before starting.
- **Customer-facing copy is Dutch (nl-BE).** Admin/private UI is English. Match the tone of the existing confirm page.
- **Neon's HTTP driver has no interactive transactions.** Every precondition lives in the statement's `WHERE` clause; the row count in `RETURNING` tells you whether you won a race. Never `BEGIN`/`COMMIT`.
- **All time comparisons use the database clock** (`now()`), never `Date.now()` in SQL.
- **Never echo driver or Mollie internals to the browser.** `console.error` the detail, return a generic message.
- **The one-hour window is deliberate.** See the comment at [app/api/tickets/checkout/route.ts:76-83](../../../app/api/tickets/checkout/route.ts#L76-L83). Do not shorten, lengthen, or remove it — only its anchor changes in Task 1.
- **Contact address:** `gentlemanproductions.official@gmail.com` ([components/Navigation/Footer.tsx:36](../../../components/Navigation/Footer.tsx#L36)).
- **Run tests with** `npm test` (Vitest, `include: ["**/*.test.ts"]`, alias `@` → repo root).
- **Do not run `npm run build` as a test.** It requires env vars that are absent locally.

## File Structure

**Server**
- `scripts/ticketing-schema.sql` (modify) — one new column.
- `app/api/tickets/checkout/route.ts` (modify) — stamp the column, re-anchor the guard.
- `lib/server/orderResume.ts` (create) — `expirePendingOrder`, `expireIfWindowLapsed`, `resumeOrder`. All Mollie-vs-order decision logic; no HTTP concerns.
- `lib/server/orderView.ts` (create) — `loadOrderView`, the read model the status endpoint returns.
- `app/api/tickets/orders/[id]/resume/route.ts` (create) — thin HTTP wrapper.
- `app/api/tickets/orders/[id]/route.ts` (modify) — return `OrderView`.
- `types.tsx` (modify) — `Order.payment_started_at`, `OrderView`, `SavedOrder`.

**Client**
- `lib/orderStore.ts` (create) — pure `localStorage` functions, no React.
- `components/SavedOrders/useSavedOrders.ts` (create) — hook binding store to React Query.
- `components/SavedOrders/ContactNote.tsx` (create) — shared "paid but no tickets?" note.
- `components/SavedOrders/SavedOrderCard.tsx` + `.module.css` (create) — the state→action switch, used by both surfaces.
- `components/SavedOrders/SavedOrderBanner.tsx` (create) — banner wrapper.
- `app/mijn-tickets/page.tsx` + `.module.css` (create) — full list.
- `app/event/[id]/ticket/[dateId]/checkout/page.tsx` (modify) — write the entry before redirect.
- `app/event/[id]/ticket/[dateId]/confirm/page.tsx` (modify) — consume `OrderView`.
- `app/event/[id]/ticket/page.tsx`, `app/event/[id]/EventClient.tsx`, `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx` (modify) — mount the banner.

---

### Task 1: `payment_started_at` — re-anchor the protection window

Resume mints a new payment on an order that may be hours old. The guard at [checkout/route.ts:84-89](../../../app/api/tickets/checkout/route.ts#L84-L89) anchors its one-hour window to `created_at`, so on such an order it would protect nothing — the resumed customer would get only a 10-minute hold where a fresh customer gets an hour, and could be sniped mid-payment. This task moves the anchor. Nothing else in the feature is safe to build first.

**Files:**
- Modify: `scripts/ticketing-schema.sql` (append at end)
- Modify: `app/api/tickets/checkout/route.ts:52-56` and `:89`
- Modify: `types.tsx:204-215`

**Interfaces:**
- Consumes: nothing.
- Produces: `orders.payment_started_at timestamptz | null`; `Order.payment_started_at: string | null`.

- [ ] **Step 1: Add the column to the schema file**

Append to `scripts/ticketing-schema.sql`:

```sql
-- Anchors the one-hour seat-protection window in the checkout claim to the
-- LATEST payment attempt rather than to order creation. Resuming an abandoned
-- order mints a fresh Mollie payment on the same (old) order row; without
-- this the guard would compare against a stale created_at, protect nothing,
-- and let a rival claim the seats out from under someone mid-payment.
-- Null on pre-existing rows; every reader uses coalesce(payment_started_at, created_at).
alter table orders add column if not exists payment_started_at timestamptz;
```

- [ ] **Step 2: Stamp it at checkout**

In `app/api/tickets/checkout/route.ts`, replace the order INSERT:

```ts
    const created = await sql`
      INSERT INTO orders (event_uuid, date_uuid, customer_name, customer_email, total_amount, status, payment_started_at)
      VALUES (${eventUuid}, ${dateUuid}, ${name}, ${email}, ${totalCents}, 'pending', now())
      RETURNING id;
    `;
```

- [ ] **Step 3: Re-anchor the guard**

In the same file, inside the claim statement, change the one line:

```ts
                 AND coalesce(o.payment_started_at, o.created_at) > now() - interval '1 hour'))
```

Leave the entire comment block above it untouched — it explains why the hour exists, and that reasoning is unchanged.

- [ ] **Step 4: Add the field to the `Order` type**

In `types.tsx`, inside `export interface Order`, after `mollie_payment_id`:

```ts
  /** Set at checkout and re-stamped on every resume; null on rows predating the column. */
  payment_started_at: string | null;
```

- [ ] **Step 5: Verify nothing broke**

Run: `npm test`
Expected: PASS (this task changes no tested behaviour; it must not regress `orderFulfillment.test.ts`).

- [ ] **Step 6: Apply the column to your database**

Run the new `alter table` statement against `DATABASE_URL` (Neon SQL editor, or `psql`). It is idempotent. **Do this before Task 4** — the resume endpoint writes this column.

- [ ] **Step 7: Commit**

```bash
git add scripts/ticketing-schema.sql app/api/tickets/checkout/route.ts types.tsx
git commit -m "feat: anchor seat protection to the latest payment attempt"
```

---

### Task 2: `expirePendingOrder` — release a lapsed order's seats

**Files:**
- Create: `lib/server/orderResume.ts`
- Test: `lib/server/orderResume.test.ts`

**Interfaces:**
- Consumes: `getMollie()` from `lib/server/mollie.ts`.
- Produces:
  ```ts
  type Sql = NeonQueryFunction<false, false>;
  type CancelablePayment = { status: string; isCancelable: boolean };
  export function expirePendingOrder(
    sql: Sql,
    order: { id: string; mollie_payment_id: string | null },
    payment: CancelablePayment | null,
  ): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `lib/server/orderResume.test.ts`. The fake `sql` mirrors the harness in [orderFulfillment.test.ts](../../../lib/server/orderFulfillment.test.ts): it derives guards from the joined SQL text rather than hardcoding them, so deleting `AND status = 'held'` from the production statement fails a test instead of passing silently.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsGet: vi.fn(),
  paymentsCancel: vi.fn(),
  paymentsCreate: vi.fn(),
  applyMolliePaymentToOrder: vi.fn(),
}));

vi.mock("@/lib/server/mollie", () => ({
  getMollie: () => ({
    payments: {
      get: mocks.paymentsGet,
      cancel: mocks.paymentsCancel,
      create: mocks.paymentsCreate,
    },
  }),
}));

vi.mock("@/lib/server/orderFulfillment", () => ({
  applyMolliePaymentToOrder: mocks.applyMolliePaymentToOrder,
}));

import { expirePendingOrder } from "@/lib/server/orderResume";

const ORDER_ID = "order-1";
const PAYMENT_ID = "tr_test_123";

interface FakeOrder {
  id: string;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  payment_started_at: string | null;
}
interface FakeTicket {
  id: string;
  order_id: string | null;
  status: "available" | "held" | "sold";
  held_until: string | null;
}
interface FakeState {
  order: FakeOrder | null;
  tickets: FakeTicket[];
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: {
      id: ORDER_ID,
      status: "pending",
      mollie_payment_id: PAYMENT_ID,
      payment_started_at: "2026-07-30T10:00:00Z",
    },
    tickets: [
      { id: "ticket-a", order_id: ORDER_ID, status: "held", held_until: "2026-07-30T10:10:00Z" },
      { id: "ticket-b", order_id: ORDER_ID, status: "held", held_until: "2026-07-30T10:10:00Z" },
    ],
    ...overrides,
  };
}

/** Cannot occur inside a SQL fragment, so joining the template never fuses
 *  two fragments into a clause present in neither. Same device as
 *  orderFulfillment.test.ts - keep it if you add branches. */
const FRAGMENT_SEPARATOR = "\u0000";

function createFakeSql(state: FakeState) {
  const calls: string[] = [];
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();
    const full = strings.join(FRAGMENT_SEPARATOR);
    calls.push(head);

    if (head.startsWith("UPDATE tickets SET status = 'available'")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'held'");
      for (const t of state.tickets) {
        if (t.order_id === orderId && (!guarded || t.status === "held")) {
          t.status = "available";
          t.held_until = null;
          t.order_id = null;
        }
      }
      return [];
    }

    if (head.startsWith("UPDATE orders SET status = 'cancelled'")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'pending'");
      if (state.order && state.order.id === orderId && (!guarded || state.order.status === "pending")) {
        state.order.status = "cancelled";
      }
      return [];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof expirePendingOrder>[0];

  return { sql: fakeSql, calls };
}

describe("expirePendingOrder", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.paymentsCancel.mockReset();
    mocks.paymentsCreate.mockReset();
  });

  it("releases the held tickets and cancels the order", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
    expect(state.tickets.every((t) => t.order_id === null)).toBe(true);
  });

  it("cancels the Mollie payment BEFORE releasing the seats", async () => {
    // Ordering is the point: releasing first leaves a window where a stale
    // Mollie tab can still charge for seats the customer no longer holds.
    const state = freshState();
    const { sql, calls } = createFakeSql(state);
    mocks.paymentsCancel.mockImplementation(async () => {
      calls.push("MOLLIE_CANCEL");
    });

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(calls[0]).toBe("MOLLIE_CANCEL");
    expect(calls[1]).toMatch(/^UPDATE tickets SET status = 'available'/);
  });

  it("does not call Mollie cancel when the payment is not cancelable", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: false });

    expect(mocks.paymentsCancel).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("cancelled");
  });

  it("still releases the seats when the Mollie cancel throws", async () => {
    // A Mollie outage must not leave the seats stranded on a dead order.
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsCancel.mockRejectedValue(new Error("mollie down"));

    await expirePendingOrder(sql, state.order!, { status: "open", isCancelable: true });

    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
  });

  it("skips Mollie entirely when no payment is supplied", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, { id: ORDER_ID, mollie_payment_id: null }, null);

    expect(mocks.paymentsGet).not.toHaveBeenCalled();
    expect(mocks.paymentsCancel).not.toHaveBeenCalled();
    expect(state.order?.status).toBe("cancelled");
  });

  it("never un-sells a paid order's tickets", async () => {
    // Pins the `AND status = 'held'` guard.
    const state = freshState();
    state.tickets[0].status = "sold";
    const { sql } = createFakeSql(state);

    await expirePendingOrder(sql, state.order!, null);

    expect(state.tickets[0].status).toBe("sold");
    expect(state.tickets[0].order_id).toBe(ORDER_ID);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/server/orderResume.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/server/orderResume"`.

- [ ] **Step 3: Implement**

Create `lib/server/orderResume.ts`:

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { getMollie } from "./mollie";

type Sql = NeonQueryFunction<false, false>;

/** The only two payment fields the expiry path needs, so tests need no full Payment. */
export type CancelablePayment = { status: string; isCancelable: boolean };

/**
 * Retire a pending order whose seat-protection window has lapsed: release its
 * seats and mark it cancelled.
 *
 * Mollie is cancelled FIRST, deliberately. Once the window has lapsed the
 * seats are claimable by rivals whether or not we release them, so releasing
 * is not what creates the risk — but leaving a live payment session behind
 * lets a stale Mollie tab charge someone for seats they no longer hold.
 * Killing the session first shrinks that window to nothing.
 *
 * If the payment is not cancelable (some methods, e.g. bank transfer) and
 * later settles anyway, `applyMolliePaymentToOrder` handles it: it finds no
 * held tickets, logs "paid but claimed no held tickets — manual intervention
 * required", and the customer is shown the existing "er is iets misgelopen"
 * copy rather than a false success.
 */
export async function expirePendingOrder(
  sql: Sql,
  order: { id: string; mollie_payment_id: string | null },
  payment: CancelablePayment | null,
): Promise<void> {
  if (order.mollie_payment_id && payment?.isCancelable) {
    try {
      await getMollie().payments.cancel(order.mollie_payment_id);
    } catch (err) {
      // Best-effort. A Mollie outage must not strand the seats on a dead order.
      console.error(`Could not cancel Mollie payment ${order.mollie_payment_id}:`, err);
    }
  }

  // `AND status = 'held'` bounds the blast radius: a sold ticket carrying this
  // order_id (paid between our read and now) must never be un-sold.
  await sql`
    UPDATE tickets SET status = 'available', held_until = NULL, order_id = NULL
    WHERE order_id = ${order.id} AND status = 'held';
  `;
  await sql`
    UPDATE orders SET status = 'cancelled'
    WHERE id = ${order.id} AND status = 'pending';
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/server/orderResume.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/server/orderResume.ts lib/server/orderResume.test.ts
git commit -m "feat: release seats and cancel Mollie for a lapsed pending order"
```

---

### Task 3: `resumeOrder` — reuse or re-mint a payment

**Files:**
- Modify: `lib/server/orderResume.ts`
- Test: `lib/server/orderResume.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `expirePendingOrder` (Task 2); `applyMolliePaymentToOrder` from `lib/server/orderFulfillment.ts`; `eurosToCents`, `isDateOpen` from `lib/server/ticketing.ts`.
- Produces:
  ```ts
  export type ResumeResult =
    | { state: "checkout"; checkoutUrl: string }
    | { state: "paid" }
    | { state: "cancelled" }
    | { state: "unknown" }
    | { state: "not_found" };
  export function resumeOrder(sql: Sql, orderId: string): Promise<ResumeResult>;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/server/orderResume.test.ts`. Add `resumeOrder` to the existing import, and extend the fake `sql` with the statements this function issues — put these branches **before** the final `throw`:

```ts
    if (head.startsWith("SELECT id, event_uuid, date_uuid, total_amount, status, mollie_payment_id")) {
      const [id] = values;
      if (!state.order || state.order.id !== id) return [];
      return [{ ...state.order, event_uuid: "event-1", date_uuid: "date-1", total_amount: 4000, window_live: state.windowLive }];
    }

    if (head.startsWith("SELECT * FROM events WHERE uuid")) {
      return [{ uuid: "event-1", title: "Test Show", tickets_open: true, dates: [{ uuid: "date-1", price: 20, start_time: "2026-08-01T19:00:00Z" }] }];
    }

    if (head.startsWith("UPDATE orders SET payment_started_at = now()")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'pending'");
      if (state.order && state.order.id === orderId && (!guarded || state.order.status === "pending")) {
        state.order.payment_started_at = "2026-07-30T12:00:00Z";
      }
      return [];
    }

    if (head.startsWith("UPDATE tickets SET held_until = now()")) {
      const [orderId] = values;
      const guarded = full.includes("AND status = 'held'");
      for (const t of state.tickets) {
        if (t.order_id === orderId && (!guarded || t.status === "held")) {
          t.held_until = "2026-07-30T12:10:00Z";
        }
      }
      return [];
    }

    if (head.startsWith("UPDATE orders SET mollie_payment_id")) {
      const [paymentId, orderId] = values;
      if (state.order && state.order.id === orderId) {
        state.order.mollie_payment_id = paymentId as string;
      }
      return [];
    }
```

Add `windowLive: boolean` to `FakeState` and default it to `true` in `freshState`. Then:

```ts
function openPayment(overrides?: Partial<{ status: string; url: string }>) {
  return {
    id: PAYMENT_ID,
    status: overrides?.status ?? "open",
    isCancelable: true,
    getCheckoutUrl: () => overrides?.url ?? "https://mollie.test/checkout/original",
  };
}

describe("resumeOrder", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.paymentsCancel.mockReset();
    mocks.paymentsCreate.mockReset();
    mocks.applyMolliePaymentToOrder.mockReset();
  });

  it("returns not_found for an unknown order", async () => {
    const state = freshState({ order: null });
    const { sql } = createFakeSql(state);
    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "not_found" });
  });

  it("reports an already-paid order without touching Mollie", async () => {
    const state = freshState();
    state.order!.status = "paid";
    const { sql } = createFakeSql(state);

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "paid" });
    expect(mocks.paymentsGet).not.toHaveBeenCalled();
  });

  it("reports an already-cancelled order", async () => {
    const state = freshState();
    state.order!.status = "cancelled";
    const { sql } = createFakeSql(state);

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "cancelled" });
  });

  it("fulfils and reports paid when Mollie says the payment succeeded", async () => {
    // The dropped-redirect case healing itself.
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status: "paid" });

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "paid" });
    expect(mocks.applyMolliePaymentToOrder).toHaveBeenCalledWith(sql, PAYMENT_ID);
    // Must be checked BEFORE the window, or a paid customer gets "expired".
    expect(state.order?.status).not.toBe("cancelled");
  });

  it("reuses the existing checkout URL when the payment is still open", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue(openPayment());

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "checkout", checkoutUrl: "https://mollie.test/checkout/original" });
    expect(mocks.paymentsCreate).not.toHaveBeenCalled();
    expect(state.order?.payment_started_at).toBe("2026-07-30T12:00:00Z");
    expect(state.tickets.every((t) => t.held_until === "2026-07-30T12:10:00Z")).toBe(true);
  });

  it("mints a new payment on the SAME order when the old one expired", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status: "expired" });
    mocks.paymentsCreate.mockResolvedValue({
      id: "tr_new_456",
      getCheckoutUrl: () => "https://mollie.test/checkout/new",
    });

    const result = await resumeOrder(sql, ORDER_ID);

    expect(result).toEqual({ state: "checkout", checkoutUrl: "https://mollie.test/checkout/new" });
    expect(state.order?.mollie_payment_id).toBe("tr_new_456");
    // Same order id keeps the confirm URL, the PDF route and the stored entry working.
    expect(mocks.paymentsCreate.mock.calls[0][0].metadata).toEqual({ orderId: ORDER_ID });
    // Charge the amount already agreed, never a recomputed one.
    expect(mocks.paymentsCreate.mock.calls[0][0].amount).toEqual({ currency: "EUR", value: "40.00" });
  });

  it("expires the order when the window has lapsed and the payment is dead", async () => {
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status: "expired" });

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "cancelled" });
    expect(state.order?.status).toBe("cancelled");
    expect(state.tickets.every((t) => t.status === "available")).toBe(true);
    expect(mocks.paymentsCreate).not.toHaveBeenCalled();
  });

  it("expires the order when the window has lapsed even though the payment is still open", async () => {
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockResolvedValue(openPayment());

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "cancelled" });
    expect(state.order?.status).toBe("cancelled");
    expect(mocks.paymentsCancel).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("returns unknown and mutates NOTHING when Mollie is unreachable", async () => {
    // Load-bearing: an outage that released a paying customer's seats would be
    // strictly worse than the bug this feature fixes.
    const state = freshState({ windowLive: false });
    const { sql } = createFakeSql(state);
    mocks.paymentsGet.mockRejectedValue(new Error("mollie down"));

    expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "unknown" });
    expect(state.order?.status).toBe("pending");
    expect(state.tickets.every((t) => t.status === "held")).toBe(true);
    expect(mocks.paymentsCreate).not.toHaveBeenCalled();
  });

  it("returns unknown while the money is in flight, without minting a second payment", async () => {
    // 'pending'/'authorized' mean Mollie is processing. A new payment here
    // could double-charge.
    for (const status of ["pending", "authorized"]) {
      const state = freshState();
      const { sql } = createFakeSql(state);
      mocks.paymentsGet.mockResolvedValue({ ...openPayment(), status });

      expect(await resumeOrder(sql, ORDER_ID)).toEqual({ state: "unknown" });
      expect(mocks.paymentsCreate).not.toHaveBeenCalled();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/server/orderResume.test.ts`
Expected: FAIL — `resumeOrder is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/server/orderResume.ts` (and add the imports at the top):

```ts
import { applyMolliePaymentToOrder } from "./orderFulfillment";
import { isDateOpen } from "./ticketing";
import type { Event } from "@/types";
```

```ts
export type ResumeResult =
  | { state: "checkout"; checkoutUrl: string }
  | { state: "paid" }
  | { state: "cancelled" }
  | { state: "unknown" }
  | { state: "not_found" };

/** Mollie is still working on it — no checkout page to send anyone to, and
 *  minting a second payment could double-charge. */
const IN_FLIGHT = ["pending", "authorized"];
/** No longer payable; a replacement payment is safe. */
const DEAD = ["expired", "canceled", "failed"];

/**
 * Continue an abandoned checkout.
 *
 * Mollie is consulted BEFORE the window is judged, always. An order whose
 * payment silently succeeded looks exactly like an abandoned one from the
 * database's side, and telling that customer their reservation expired would
 * invite a second payment for tickets they already own.
 */
export async function resumeOrder(sql: Sql, orderId: string): Promise<ResumeResult> {
  const rows = await sql`
    SELECT id, event_uuid, date_uuid, total_amount, status, mollie_payment_id,
           coalesce(payment_started_at, created_at) > now() - interval '1 hour' AS window_live
    FROM orders WHERE id = ${orderId};
  `;
  const order = rows[0] as
    | {
        id: string;
        event_uuid: string;
        date_uuid: string;
        total_amount: number;
        status: "pending" | "paid" | "cancelled";
        mollie_payment_id: string | null;
        window_live: boolean;
      }
    | undefined;

  if (!order) return { state: "not_found" };
  if (order.status === "paid") return { state: "paid" };
  if (order.status === "cancelled") return { state: "cancelled" };

  // A pending order with no payment never got past checkout's Mollie call and
  // its compensation should already have removed it. Nothing to resume.
  if (!order.mollie_payment_id) return { state: "unknown" };

  let payment;
  try {
    payment = await getMollie().payments.get(order.mollie_payment_id);
  } catch (err) {
    console.error(`Resume could not reach Mollie for order ${orderId}:`, err);
    return { state: "unknown" };
  }

  if (payment.status === "paid") {
    await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
    return { state: "paid" };
  }

  if (IN_FLIGHT.includes(payment.status)) return { state: "unknown" };

  if (!order.window_live) {
    await expirePendingOrder(sql, order, payment);
    return { state: "cancelled" };
  }

  // Inside the window the seats are provably still this order's: the checkout
  // claim guard cannot hand even one of them to a rival. So there is no
  // seat-count reconciliation to do here — only a clock to push forward.
  await sql`
    UPDATE orders SET payment_started_at = now()
    WHERE id = ${orderId} AND status = 'pending';
  `;
  await sql`
    UPDATE tickets SET held_until = now() + interval '10 minutes'
    WHERE order_id = ${orderId} AND status = 'held';
  `;

  if (payment.status === "open") {
    return { state: "checkout", checkoutUrl: payment.getCheckoutUrl()! };
  }

  if (!DEAD.includes(payment.status)) {
    console.error(`Resume saw unexpected Mollie status "${payment.status}" on order ${orderId}`);
    return { state: "unknown" };
  }

  const events = await sql`SELECT * FROM events WHERE uuid = ${order.event_uuid};`;
  const event = events[0] as Event | undefined;
  const date = (event?.dates ?? []).find((d) => d.uuid === order.date_uuid);
  if (!event || !date || !isDateOpen(event, date)) return { state: "unknown" };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const isLocal = baseUrl.includes("localhost");

  // The stored total, never a recomputed one: the customer agreed to this
  // amount, and a price edit since then must not silently change it.
  const fresh = await getMollie().payments.create({
    amount: { currency: "EUR", value: (order.total_amount / 100).toFixed(2) },
    description: `Tickets – ${event.title}`,
    redirectUrl: `${baseUrl}/event/${order.event_uuid}/ticket/${order.date_uuid}/confirm?order=${orderId}`,
    ...(isLocal ? {} : { webhookUrl: `${baseUrl}/api/tickets/webhook/mollie` }),
    metadata: { orderId },
  });

  await sql`
    UPDATE orders SET mollie_payment_id = ${fresh.id} WHERE id = ${orderId};
  `;

  return { state: "checkout", checkoutUrl: fresh.getCheckoutUrl()! };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/server/orderResume.test.ts`
Expected: PASS, 16 tests total in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/server/orderResume.ts lib/server/orderResume.test.ts
git commit -m "feat: resume an abandoned checkout on the same order id"
```

---

### Task 4: `POST /api/tickets/orders/[id]/resume`

**Files:**
- Create: `app/api/tickets/orders/[id]/resume/route.ts`

**Interfaces:**
- Consumes: `resumeOrder` (Task 3); `checkRateLimit`, `getClientIp` from `lib/rateLimit.ts`; `isUuid` from `lib/server/checkoutValidation.ts`.
- Produces: `POST /api/tickets/orders/<uuid>/resume` → `200 {checkoutUrl}` | `200 {state}` | `404` | `429`.

- [ ] **Step 1: Implement the route**

Note the `{ params }` signature. `getPathId` returns the **last** path segment, which is `"resume"` here — use the params object like the sibling `pdf` and `resend` routes do.

```ts
import { jsonResponse, errorResponse, getDb } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { resumeOrder } from "@/lib/server/orderResume";

/**
 * Continue an abandoned checkout. Guarded, like the PDF route, by possession
 * of the unguessable order UUID — it grants no more than a forwarded
 * confirmation email already would. Rate-limited on top of that because each
 * call can reach Mollie and may create a payment.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`resume:${clientIp}`, 20, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return errorResponse("Te veel pogingen. Probeer het straks opnieuw.", 429);
  }

  try {
    const result = await resumeOrder(getDb(), id);
    if (result.state === "not_found") return errorResponse("Order not found", 404);
    if (result.state === "checkout") return jsonResponse({ checkoutUrl: result.checkoutUrl });
    return jsonResponse({ state: result.state });
  } catch (err) {
    console.error(`Resume failed for order ${id}:`, err);
    return errorResponse("Kon je bestelling niet hervatten. Probeer het opnieuw.", 500);
  }
}
```

- [ ] **Step 2: Verify the route responds**

Run `npm run dev`, then against a real pending order id from your database:

```bash
curl -s -X POST http://localhost:3000/api/tickets/orders/<order-uuid>/resume
```

Expected: `{"checkoutUrl":"https://..."}` for a live pending order, or `{"state":"cancelled"}` for one past its window. Then:

```bash
curl -s -X POST http://localhost:3000/api/tickets/orders/not-a-uuid/resume
```

Expected: `{"error":"Order not found"}` with status 404.

- [ ] **Step 3: Commit**

```bash
git add app/api/tickets/orders/\[id\]/resume/route.ts
git commit -m "feat: add the order resume endpoint"
```

---

### Task 5: `loadOrderView` — the read model behind the status endpoint

**Files:**
- Create: `lib/server/orderView.ts`
- Test: `lib/server/orderView.test.ts`
- Modify: `types.tsx`

**Interfaces:**
- Consumes: `applyMolliePaymentToOrder`; `expirePendingOrder` (Task 2).
- Produces:
  ```ts
  export interface OrderViewBase {
    orderId: string; eventUuid: string; dateUuid: string;
    eventTitle: string; startTime: string | null;
    seatLabels: string[]; totalAmount: number;
  }
  export type OrderView =
    | (OrderViewBase & { state: "pending"; resumable: boolean; expiresAt: string })
    | (OrderViewBase & { state: "paid"; hasTickets: boolean })
    | (OrderViewBase & { state: "cancelled" });
  export function loadOrderView(sql: Sql, orderId: string): Promise<OrderView | null>;
  ```

- [ ] **Step 1: Add `OrderView` to `types.tsx`**

Append to the Ticketing Types section of `types.tsx`:

```ts
export interface OrderViewBase {
  orderId: string;
  eventUuid: string;
  dateUuid: string;
  eventTitle: string;
  startTime: string | null;
  /** e.g. ["A1", "A2"] — the seats this order currently holds or has sold. */
  seatLabels: string[];
  /** Integer cents, as stored on the order. */
  totalAmount: number;
}

export type OrderView =
  | (OrderViewBase & { state: "pending"; resumable: boolean; expiresAt: string })
  | (OrderViewBase & { state: "paid"; hasTickets: boolean })
  | (OrderViewBase & { state: "cancelled" });
```

- [ ] **Step 2: Write the failing tests**

Create `lib/server/orderView.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  paymentsGet: vi.fn(),
  applyMolliePaymentToOrder: vi.fn(),
  expirePendingOrder: vi.fn(),
}));

vi.mock("@/lib/server/mollie", () => ({
  getMollie: () => ({ payments: { get: mocks.paymentsGet } }),
}));
vi.mock("@/lib/server/orderFulfillment", () => ({
  applyMolliePaymentToOrder: mocks.applyMolliePaymentToOrder,
}));
vi.mock("@/lib/server/orderResume", () => ({
  expirePendingOrder: mocks.expirePendingOrder,
}));

import { loadOrderView } from "@/lib/server/orderView";

const ORDER_ID = "order-1";
const PAYMENT_ID = "tr_test_123";

interface FakeState {
  order: {
    id: string;
    status: "pending" | "paid" | "cancelled";
    mollie_payment_id: string | null;
    window_live: boolean;
  } | null;
  soldCount: number;
}

function freshState(overrides?: Partial<FakeState>): FakeState {
  return {
    order: { id: ORDER_ID, status: "pending", mollie_payment_id: PAYMENT_ID, window_live: true },
    soldCount: 0,
    ...overrides,
  };
}

function createFakeSql(state: FakeState) {
  const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const head = strings[0].trim();

    if (head.startsWith("SELECT o.id")) {
      const [id] = values;
      if (!state.order || state.order.id !== id) return [];
      return [{
        id: state.order.id,
        status: state.order.status,
        mollie_payment_id: state.order.mollie_payment_id,
        window_live: state.order.window_live,
        expires_at: "2026-07-30T11:00:00Z",
        event_uuid: "event-1",
        date_uuid: "date-1",
        total_amount: 4000,
        has_tickets: state.soldCount > 0,
      }];
    }

    if (head.startsWith('SELECT s."row"')) {
      return [
        { row: "A", seat_number: 1 },
        { row: "A", seat_number: 2 },
      ];
    }

    if (head.startsWith("SELECT title, dates FROM events")) {
      return [{ title: "Test Show", dates: [{ uuid: "date-1", start_time: "2026-08-01T19:00:00Z" }] }];
    }

    throw new Error(`Unhandled fake SQL in test: ${head}`);
  }) as unknown as Parameters<typeof loadOrderView>[0];

  return { sql: fakeSql };
}

describe("loadOrderView", () => {
  beforeEach(() => {
    mocks.paymentsGet.mockReset();
    mocks.applyMolliePaymentToOrder.mockReset();
    mocks.expirePendingOrder.mockReset();
  });

  it("returns null for an unknown order", async () => {
    const { sql } = createFakeSql(freshState({ order: null }));
    expect(await loadOrderView(sql, ORDER_ID)).toBeNull();
  });

  it("describes a live pending order as resumable, with its seats and total", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockResolvedValue("ignored");

    const view = await loadOrderView(sql, ORDER_ID);

    expect(view).toEqual({
      state: "pending",
      resumable: true,
      expiresAt: "2026-07-30T11:00:00Z",
      orderId: ORDER_ID,
      eventUuid: "event-1",
      dateUuid: "date-1",
      eventTitle: "Test Show",
      startTime: "2026-08-01T19:00:00Z",
      seatLabels: ["A1", "A2"],
      totalAmount: 4000,
    });
  });

  it("reconciles against Mollie before reporting, so a dropped webhook heals", async () => {
    const state = freshState();
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockImplementation(async () => {
      state.order!.status = "paid";
      state.soldCount = 2;
      return "paid";
    });

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.applyMolliePaymentToOrder).toHaveBeenCalledWith(sql, PAYMENT_ID);
    expect(view).toMatchObject({ state: "paid", hasTickets: true });
  });

  it("expires a lapsed pending order whose payment is merely open", async () => {
    const state = freshState();
    state.order!.window_live = false;
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockResolvedValue("ignored");
    mocks.paymentsGet.mockResolvedValue({ status: "open", isCancelable: true });
    mocks.expirePendingOrder.mockImplementation(async () => {
      state.order!.status = "cancelled";
    });

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.expirePendingOrder).toHaveBeenCalled();
    expect(view).toMatchObject({ state: "cancelled" });
  });

  it("does NOT expire a lapsed order whose payment is in flight", async () => {
    const state = freshState();
    state.order!.window_live = false;
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockResolvedValue("ignored");
    mocks.paymentsGet.mockResolvedValue({ status: "pending", isCancelable: false });

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.expirePendingOrder).not.toHaveBeenCalled();
    expect(view).toMatchObject({ state: "pending", resumable: false });
  });

  it("leaves a lapsed order alone when Mollie is unreachable", async () => {
    const state = freshState();
    state.order!.window_live = false;
    const { sql } = createFakeSql(state);
    mocks.applyMolliePaymentToOrder.mockRejectedValue(new Error("mollie down"));
    mocks.paymentsGet.mockRejectedValue(new Error("mollie down"));

    const view = await loadOrderView(sql, ORDER_ID);

    expect(mocks.expirePendingOrder).not.toHaveBeenCalled();
    expect(view).toMatchObject({ state: "pending", resumable: false });
  });

  it("reports a paid order that holds no seats, so the UI never claims success", async () => {
    const state = freshState();
    state.order!.status = "paid";
    state.soldCount = 0;
    const { sql } = createFakeSql(state);

    expect(await loadOrderView(sql, ORDER_ID)).toMatchObject({ state: "paid", hasTickets: false });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/server/orderView.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/server/orderView"`.

- [ ] **Step 4: Implement**

Create `lib/server/orderView.ts`:

```ts
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { applyMolliePaymentToOrder } from "./orderFulfillment";
import { expirePendingOrder } from "./orderResume";
import { getMollie } from "./mollie";
import type { OrderView } from "@/types";

type Sql = NeonQueryFunction<false, false>;

interface OrderRow {
  id: string;
  status: "pending" | "paid" | "cancelled";
  mollie_payment_id: string | null;
  window_live: boolean;
  expires_at: string;
  event_uuid: string;
  date_uuid: string;
  total_amount: number;
  has_tickets: boolean;
}

async function readOrderRow(sql: Sql, orderId: string): Promise<OrderRow | undefined> {
  const rows = await sql`
    SELECT o.id, o.status, o.mollie_payment_id, o.event_uuid, o.date_uuid, o.total_amount,
           coalesce(o.payment_started_at, o.created_at) > now() - interval '1 hour' AS window_live,
           coalesce(o.payment_started_at, o.created_at) + interval '1 hour' AS expires_at,
           EXISTS(SELECT 1 FROM tickets WHERE order_id = o.id AND status = 'sold') AS has_tickets
    FROM orders o WHERE o.id = ${orderId};
  `;
  return rows[0] as OrderRow | undefined;
}

/**
 * Everything the browser needs to render one saved order.
 *
 * Reconciles as a side effect, on purpose. The webhook is the primary
 * fulfilment path but can be dropped or delayed, and this endpoint is polled
 * by both the confirm page and the saved-order banner — which makes it the
 * most reliable moment we get to re-check Mollie. It also retires an order
 * whose protection window has lapsed, returning its seats to the pool
 * immediately instead of leaving them attached to a dead order until the
 * nightly reconcile sweep.
 */
export async function loadOrderView(sql: Sql, orderId: string): Promise<OrderView | null> {
  let order = await readOrderRow(sql, orderId);
  if (!order) return null;

  if (order.status === "pending" && order.mollie_payment_id) {
    try {
      await applyMolliePaymentToOrder(sql, order.mollie_payment_id);
      order = (await readOrderRow(sql, orderId)) ?? order;
    } catch (err) {
      console.error(`Reconciliation failed for order ${orderId}:`, err);
    }

    // Still pending past its window: fulfilment left it alone, which means
    // Mollie reported something other than paid/dead. Only an `open` payment
    // may be retired here — 'pending'/'authorized' mean money is in flight,
    // and expiring those would release seats a customer is about to own.
    if (order.status === "pending" && !order.window_live && order.mollie_payment_id) {
      try {
        const payment = await getMollie().payments.get(order.mollie_payment_id);
        if (payment.status === "open") {
          await expirePendingOrder(sql, order, payment);
          order = (await readOrderRow(sql, orderId)) ?? order;
        }
      } catch (err) {
        // Unreachable Mollie means we cannot prove the order is unpaid, so we
        // must not expire it. It stays pending and non-resumable.
        console.error(`Window check failed for order ${orderId}:`, err);
      }
    }
  }

  const seatRows = await sql`
    SELECT s."row" AS row, s.seat_number AS seat_number
    FROM tickets t JOIN seats s ON s.id = t.seat_id
    WHERE t.order_id = ${orderId}
    ORDER BY s."row", s.seat_number;
  `;
  const eventRows = await sql`SELECT title, dates FROM events WHERE uuid = ${order.event_uuid};`;
  const event = eventRows[0] as
    | { title: string; dates: { uuid: string; start_time: string }[] | null }
    | undefined;

  const base = {
    orderId: order.id,
    eventUuid: order.event_uuid,
    dateUuid: order.date_uuid,
    eventTitle: event?.title ?? "Voorstelling",
    startTime:
      (event?.dates ?? []).find((d) => d.uuid === order.date_uuid)?.start_time ?? null,
    seatLabels: seatRows.map((r) => `${r.row}${r.seat_number}`),
    totalAmount: order.total_amount,
  };

  if (order.status === "paid") return { ...base, state: "paid", hasTickets: order.has_tickets };
  if (order.status === "cancelled") return { ...base, state: "cancelled" };
  return {
    ...base,
    state: "pending",
    resumable: order.window_live,
    expiresAt: new Date(order.expires_at).toISOString(),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/server/orderView.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/server/orderView.ts lib/server/orderView.test.ts types.tsx
git commit -m "feat: add the order read model behind the status endpoint"
```

---

### Task 6: Serve `OrderView` from the status endpoint

The confirm page is the only current consumer and reads `data.status` / `data.has_tickets`, so it changes in the same commit — a reviewer cannot sensibly approve one without the other.

**Files:**
- Modify: `app/api/tickets/orders/[id]/route.ts` (replace the whole file)
- Modify: `app/event/[id]/ticket/[dateId]/confirm/page.tsx:22-52, 65, 81, 98`

**Interfaces:**
- Consumes: `loadOrderView` (Task 5).
- Produces: `GET /api/tickets/orders/<uuid>` → `OrderView` JSON.

- [ ] **Step 1: Rewrite the route**

```ts
import { getDb, jsonResponse, errorResponse } from "@/lib/server/api";
import { isUuid } from "@/lib/server/checkoutValidation";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { loadOrderView } from "@/lib/server/orderView";

/**
 * Public order status, guarded by possession of the unguessable order UUID —
 * the same trust model as the ticket PDF download. Rate-limited because the
 * saved-order banner polls it on page load and it can reach Mollie.
 *
 * Deliberately returns no customer name or email: the browser already holds
 * what it submitted, and an order UUID should disclose no more than a
 * forwarded confirmation email does.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return errorResponse("Order not found", 404);

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`order-view:${clientIp}`, 120, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    return errorResponse("Te veel aanvragen. Probeer het straks opnieuw.", 429);
  }

  try {
    const view = await loadOrderView(getDb(), id);
    if (!view) return errorResponse("Order not found", 404);
    return jsonResponse(view);
  } catch (err) {
    console.error("Failed to load order:", err);
    return errorResponse("Failed to load order", 500);
  }
}
```

The limit is 120 per 15 minutes: the confirm page polls up to 20 times per payment, and a visitor may hold several saved orders.

- [ ] **Step 2: Update the confirm page to the new shape**

In `app/event/[id]/ticket/[dateId]/confirm/page.tsx`, replace the state and the poll body:

```tsx
  const [view, setView] = useState<OrderView | null>(null);
  const [timedOut, setTimedOut] = useState(false);
```

```tsx
      try {
        const res = await fetch(`/api/tickets/orders/${orderId}`);
        const data = (await res.json()) as OrderView | { error: string };
        if (cancelled) return;
        if ("state" in data && data.state !== "pending") {
          setView(data);
          return;
        }
      } catch {
        // Network hiccup — keep polling until the attempt budget runs out.
      }
```

Then change the four render guards, keeping every existing string:
- `if (!status && !timedOut)` → `if (!view && !timedOut)`
- `if (status === "paid" && !hasTickets)` → `if (view?.state === "paid" && !view.hasTickets)`
- `if (status === "paid")` → `if (view?.state === "paid")`
- `if (status === "cancelled")` → `if (view?.state === "cancelled")`

Add `import type { OrderView } from "@/types";` and delete the now-unused `hasTickets` state.

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: PASS.

Then `npm run dev` and, with a real order id:

```bash
curl -s http://localhost:3000/api/tickets/orders/<order-uuid> | head -c 400
```

Expected: JSON containing `"state"`, `"seatLabels"`, `"eventTitle"` — and **no** `customer_email`.

- [ ] **Step 4: Commit**

```bash
git add app/api/tickets/orders/\[id\]/route.ts "app/event/[id]/ticket/[dateId]/confirm/page.tsx"
git commit -m "feat: serve the full order view from the status endpoint"
```

---

### Task 7: `lib/orderStore.ts` — durable list of this browser's orders

**Files:**
- Create: `lib/orderStore.ts`
- Test: `lib/orderStore.test.ts`
- Modify: `types.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SavedOrder {
    orderId: string; eventUuid: string; dateUuid: string;
    eventTitle: string; startTime: string | null;
    seatLabels: string[]; email: string; savedAt: string;
    lastKnownStatus: "pending" | "paid" | "cancelled";
    statusChangedAt: string;
  }
  export const ORDER_STORE_KEY = "gp.orders.v1";
  export function listOrders(storage: Storage | undefined): SavedOrder[];
  export function addOrder(storage: Storage | undefined, entry: SavedOrder): void;
  export function updateOrder(storage: Storage | undefined, orderId: string,
    patch: Partial<SavedOrder>, now?: Date): void;
  export function removeOrder(storage: Storage | undefined, orderId: string): void;
  export function pruneOrders(entries: SavedOrder[], now: Date): SavedOrder[];
  ```

- [ ] **Step 1: Add `SavedOrder` to `types.tsx`**

Append to the Ticketing Types section:

```ts
/** One order this browser created. Durable user data, not a cache. */
export interface SavedOrder {
  orderId: string;
  eventUuid: string;
  dateUuid: string;
  eventTitle: string;
  startTime: string | null;
  seatLabels: string[];
  email: string;
  savedAt: string;
  lastKnownStatus: "pending" | "paid" | "cancelled";
  /** When lastKnownStatus last changed — the clock the cancelled prune measures from. */
  statusChangedAt: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `lib/orderStore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { SavedOrder } from "@/types";
import {
  ORDER_STORE_KEY,
  listOrders,
  addOrder,
  updateOrder,
  removeOrder,
  pruneOrders,
} from "@/lib/orderStore";

/** Minimal in-memory Storage. Vitest runs in `node`, so there is no real one. */
function fakeStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

function entry(overrides?: Partial<SavedOrder>): SavedOrder {
  return {
    orderId: "order-1",
    eventUuid: "event-1",
    dateUuid: "date-1",
    eventTitle: "Test Show",
    startTime: "2026-08-01T19:00:00Z",
    seatLabels: ["A1", "A2"],
    email: "ada@example.com",
    savedAt: "2026-07-30T10:00:00Z",
    lastKnownStatus: "pending",
    statusChangedAt: "2026-07-30T10:00:00Z",
    ...overrides,
  };
}

describe("orderStore round-trip", () => {
  it("stores and reads back an order", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());
    expect(listOrders(storage)).toEqual([entry()]);
  });

  it("puts the newest order first", () => {
    const storage = fakeStorage();
    addOrder(storage, entry({ orderId: "order-1" }));
    addOrder(storage, entry({ orderId: "order-2" }));
    expect(listOrders(storage).map((e) => e.orderId)).toEqual(["order-2", "order-1"]);
  });

  it("replaces rather than duplicates an order it already holds", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());
    addOrder(storage, entry({ seatLabels: ["B3"] }));
    const all = listOrders(storage);
    expect(all).toHaveLength(1);
    expect(all[0].seatLabels).toEqual(["B3"]);
  });

  it("patches an entry and stamps statusChangedAt only when the status moves", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());

    updateOrder(storage, "order-1", { seatLabels: ["C1"] }, new Date("2026-07-30T11:00:00Z"));
    expect(listOrders(storage)[0].statusChangedAt).toBe("2026-07-30T10:00:00Z");

    updateOrder(storage, "order-1", { lastKnownStatus: "paid" }, new Date("2026-07-30T12:00:00Z"));
    expect(listOrders(storage)[0].statusChangedAt).toBe("2026-07-30T12:00:00Z");
  });

  it("removes an order", () => {
    const storage = fakeStorage();
    addOrder(storage, entry());
    removeOrder(storage, "order-1");
    expect(listOrders(storage)).toEqual([]);
  });
});

describe("orderStore resilience", () => {
  it("treats a corrupt value as empty instead of throwing", () => {
    const storage = fakeStorage({ [ORDER_STORE_KEY]: "{not json" });
    expect(listOrders(storage)).toEqual([]);
  });

  it("treats a non-array value as empty", () => {
    const storage = fakeStorage({ [ORDER_STORE_KEY]: '{"orderId":"x"}' });
    expect(listOrders(storage)).toEqual([]);
  });

  it("ignores an older version's key", () => {
    const storage = fakeStorage({ "gp.orders.v0": JSON.stringify([entry()]) });
    expect(listOrders(storage)).toEqual([]);
  });

  it("returns empty when there is no storage at all (SSR)", () => {
    expect(listOrders(undefined)).toEqual([]);
  });

  it("never propagates a throwing setItem", () => {
    // Safari private mode. Losing persistence is acceptable; breaking the
    // checkout redirect that runs immediately afterwards is not.
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => addOrder(storage, entry())).not.toThrow();
  });
});

describe("pruneOrders", () => {
  const now = new Date("2026-08-02T20:00:00Z");

  it("keeps a paid order until 24h after the show", () => {
    const justInside = entry({ lastKnownStatus: "paid", startTime: "2026-08-01T21:00:00Z" });
    expect(pruneOrders([justInside], now)).toHaveLength(1);
  });

  it("drops a paid order more than 24h after the show", () => {
    const justOutside = entry({ lastKnownStatus: "paid", startTime: "2026-08-01T19:00:00Z" });
    expect(pruneOrders([justOutside], now)).toHaveLength(0);
  });

  it("keeps a cancelled order for 24h after it was cancelled", () => {
    const fresh = entry({ lastKnownStatus: "cancelled", statusChangedAt: "2026-08-02T10:00:00Z" });
    expect(pruneOrders([fresh], now)).toHaveLength(1);
  });

  it("drops a cancelled order more than 24h old", () => {
    const stale = entry({ lastKnownStatus: "cancelled", statusChangedAt: "2026-08-01T10:00:00Z" });
    expect(pruneOrders([stale], now)).toHaveLength(0);
  });

  it("never drops a pending order, however old", () => {
    // A pending order may be a payment whose webhook was dropped. Forgetting
    // it locally is how a paying customer gets told to buy again.
    const ancient = entry({
      lastKnownStatus: "pending",
      savedAt: "2020-01-01T00:00:00Z",
      statusChangedAt: "2020-01-01T00:00:00Z",
      startTime: "2020-01-02T19:00:00Z",
    });
    expect(pruneOrders([ancient], now)).toHaveLength(1);
  });

  it("keeps a paid order with no known start time", () => {
    const undated = entry({ lastKnownStatus: "paid", startTime: null });
    expect(pruneOrders([undated], now)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/orderStore.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/orderStore"`.

- [ ] **Step 4: Implement**

Create `lib/orderStore.ts`:

```ts
import type { SavedOrder } from "@/types";

/**
 * Durable record of the orders this browser created.
 *
 * Deliberately NOT the React Query persisted cache, even though one already
 * exists: a cache may evict, garbage-collect and expire by maxAge, and "the
 * link to the tickets I paid for" must survive all three. This module owns
 * *which orders are mine*; the server remains the only authority on what
 * state they are in.
 *
 * Every function takes `Storage` explicitly so tests drive a fake and so
 * server-side rendering can pass `undefined` without a `typeof window` dance
 * at each call site.
 */
export const ORDER_STORE_KEY = "gp.orders.v1";

const DAY_MS = 24 * 60 * 60 * 1000;

function read(storage: Storage | undefined): SavedOrder[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORDER_STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedOrder[]) : [];
  } catch {
    // Corrupt, foreign, or unreadable. An empty list loses at worst a
    // convenience; throwing here would break the pages that read it.
    return [];
  }
}

function write(storage: Storage | undefined, entries: SavedOrder[]): void {
  if (!storage) return;
  try {
    storage.setItem(ORDER_STORE_KEY, JSON.stringify(entries));
  } catch (err) {
    // Safari private mode throws on setItem. Degrade to no persistence —
    // this runs immediately before the checkout redirect, which must proceed.
    console.warn("Could not persist saved orders:", err);
  }
}

export function listOrders(storage: Storage | undefined): SavedOrder[] {
  return read(storage);
}

/** Newest first. Re-adding a known order replaces it rather than duplicating. */
export function addOrder(storage: Storage | undefined, entry: SavedOrder): void {
  const rest = read(storage).filter((e) => e.orderId !== entry.orderId);
  write(storage, [entry, ...rest]);
}

export function updateOrder(
  storage: Storage | undefined,
  orderId: string,
  patch: Partial<SavedOrder>,
  now: Date = new Date(),
): void {
  const entries = read(storage).map((e) => {
    if (e.orderId !== orderId) return e;
    const statusMoved =
      patch.lastKnownStatus !== undefined && patch.lastKnownStatus !== e.lastKnownStatus;
    return {
      ...e,
      ...patch,
      statusChangedAt: statusMoved ? now.toISOString() : e.statusChangedAt,
    };
  });
  write(storage, entries);
}

export function removeOrder(storage: Storage | undefined, orderId: string): void {
  write(
    storage,
    read(storage).filter((e) => e.orderId !== orderId),
  );
}

/**
 * Drop entries the server has already resolved and that are no longer useful.
 *
 * `pending` is never dropped on age. A pending order may be a payment whose
 * webhook was lost, and forgetting it locally is precisely how such a
 * customer ends up being told to buy tickets they already own. Only the
 * server may retire a pending order, by reporting it cancelled.
 */
export function pruneOrders(entries: SavedOrder[], now: Date): SavedOrder[] {
  return entries.filter((e) => {
    if (e.lastKnownStatus === "pending") return true;
    if (e.lastKnownStatus === "cancelled") {
      return now.getTime() - new Date(e.statusChangedAt).getTime() < DAY_MS;
    }
    if (!e.startTime) return true;
    return now.getTime() - new Date(e.startTime).getTime() < DAY_MS;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/orderStore.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/orderStore.ts lib/orderStore.test.ts types.tsx
git commit -m "feat: persist this browser's orders in local storage"
```

---

### Task 8: Save the order at checkout

Nothing else in the feature works until entries exist. This writes one at the only moment the browser holds the order id, the seat labels and the email together — and crucially **before** the redirect that can fail.

**Files:**
- Modify: `app/event/[id]/ticket/[dateId]/checkout/page.tsx:114-135`

**Interfaces:**
- Consumes: `addOrder`, `SavedOrder` (Task 7).
- Produces: a `gp.orders.v1` entry per successful checkout.

- [ ] **Step 1: Return the order id from checkout**

The checkout route currently returns only `checkoutUrl`. In `app/api/tickets/checkout/route.ts`, change the success response:

```ts
    return jsonResponse({ checkoutUrl: payment.getCheckoutUrl(), orderId });
```

- [ ] **Step 2: Write the entry before redirecting**

In `app/event/[id]/ticket/[dateId]/checkout/page.tsx`, add the import:

```ts
import { addOrder } from "@/lib/orderStore";
```

and replace the body of `handleSubmit`'s success branch:

```ts
      if (data.checkoutUrl) {
        // Written BEFORE the redirect, deliberately. This is the last moment
        // the browser holds the order id, the seats and the email together —
        // and if the return trip from Mollie is lost, this entry is the only
        // way the customer ever finds their payment again.
        if (data.orderId) {
          addOrder(typeof window === "undefined" ? undefined : window.localStorage, {
            orderId: data.orderId,
            eventUuid: id as string,
            dateUuid: dateId as string,
            eventTitle: event!.title,
            startTime: date!.start_time,
            seatLabels: chosenSeats.map((t) => `${t.seat.row}${t.seat.seat_number}`),
            email,
            savedAt: new Date().toISOString(),
            lastKnownStatus: "pending",
            statusChangedAt: new Date().toISOString(),
          });
        }
        window.location.href = data.checkoutUrl;
      } else {
```

- [ ] **Step 3: Verify by hand**

Run `npm run dev`, complete a checkout up to the Mollie redirect, then in the browser console:

```js
JSON.parse(localStorage.getItem("gp.orders.v1"))
```

Expected: one entry with your order id, the seats you picked, and `lastKnownStatus: "pending"`.

- [ ] **Step 4: Commit**

```bash
git add "app/event/[id]/ticket/[dateId]/checkout/page.tsx" app/api/tickets/checkout/route.ts
git commit -m "feat: save the order to browser storage before the payment redirect"
```

---

### Task 9: `useSavedOrders` — bind the store to live status

**Files:**
- Create: `components/SavedOrders/useSavedOrders.ts`

**Interfaces:**
- Consumes: `listOrders`, `pruneOrders`, `updateOrder`, `removeOrder` (Task 7); `OrderView` (Task 5).
- Produces:
  ```ts
  export interface SavedOrderWithView { saved: SavedOrder; view: OrderView | undefined; isLoading: boolean }
  export function useSavedOrders(): {
    orders: SavedOrderWithView[];
    forget: (orderId: string) => void;
  };
  export function useSavedOrdersForDate(dateUuid: string | undefined): { … same shape … };
  ```

- [ ] **Step 1: Implement the hook**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { OrderView, SavedOrder } from "@/types";
import { listOrders, pruneOrders, removeOrder, updateOrder } from "@/lib/orderStore";

export interface SavedOrderWithView {
  saved: SavedOrder;
  view: OrderView | undefined;
  isLoading: boolean;
}

/** Undefined during the server pass; localStorage does not exist there. */
function storage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

async function fetchOrderView(orderId: string): Promise<OrderView | null> {
  const res = await fetch(`/api/tickets/orders/${orderId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Order status ${res.status}`);
  return (await res.json()) as OrderView;
}

/**
 * The saved list plus each order's live server state.
 *
 * The store is read once on mount rather than during render: it is a browser
 * API, and reading it while rendering would mismatch the server-rendered
 * HTML. Status always comes from the server — a stored `lastKnownStatus` is
 * only a hint for pruning, never something the UI trusts.
 */
export function useSavedOrders() {
  const [saved, setSaved] = useState<SavedOrder[]>([]);

  useEffect(() => {
    const s = storage();
    const pruned = pruneOrders(listOrders(s), new Date());
    setSaved(pruned);
    // Persist the prune so the list does not grow without bound.
    for (const gone of listOrders(s).filter((e) => !pruned.some((p) => p.orderId === e.orderId))) {
      removeOrder(s, gone.orderId);
    }
  }, []);

  const results = useQueries({
    queries: saved.map((entry) => ({
      queryKey: ["order", entry.orderId],
      queryFn: () => fetchOrderView(entry.orderId),
      // Deliberately short: a saved order's state is exactly the thing that
      // changes behind the user's back while they are on Mollie's page.
      staleTime: 15_000,
      gcTime: 60_000,
      retry: 1,
    })),
  });

  // Mirror server status back into the store so the prune rules have a clock.
  useEffect(() => {
    const s = storage();
    results.forEach((result, i) => {
      const view = result.data;
      const entry = saved[i];
      if (!view || !entry || view.state === entry.lastKnownStatus) return;
      updateOrder(s, entry.orderId, { lastKnownStatus: view.state });
    });
  }, [results, saved]);

  const forget = useCallback((orderId: string) => {
    removeOrder(storage(), orderId);
    setSaved((prev) => prev.filter((e) => e.orderId !== orderId));
  }, []);

  const orders: SavedOrderWithView[] = saved.map((entry, i) => ({
    saved: entry,
    view: results[i]?.data ?? undefined,
    isLoading: results[i]?.isLoading ?? true,
  }));

  return { orders, forget };
}

/** The same list narrowed to one performance, for the seat-map banner. */
export function useSavedOrdersForDate(dateUuid: string | undefined) {
  const { orders, forget } = useSavedOrders();
  return {
    orders: dateUuid ? orders.filter((o) => o.saved.dateUuid === dateUuid) : orders,
    forget,
  };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors from `components/SavedOrders/useSavedOrders.ts`.

- [ ] **Step 3: Commit**

```bash
git add components/SavedOrders/useSavedOrders.ts
git commit -m "feat: add the saved-orders hook"
```

---

### Task 10: `SavedOrderCard` and `ContactNote` — the state→action switch

One component renders every state, so the banner and `/mijn-tickets` cannot drift apart.

**Files:**
- Create: `components/SavedOrders/ContactNote.tsx`
- Create: `components/SavedOrders/SavedOrderCard.tsx`
- Create: `components/SavedOrders/SavedOrders.module.css`

**Interfaces:**
- Consumes: `SavedOrderWithView` (Task 9).
- Produces: `<SavedOrderCard order={…} onForget={(id) => void} />`, `<ContactNote orderId={…} />`.

- [ ] **Step 1: Write `ContactNote`**

```tsx
"use client";

import styles from "./SavedOrders.module.css";

const CONTACT_EMAIL = "gentlemanproductions.official@gmail.com";

/**
 * Shown wherever we tell someone their order did not complete.
 *
 * The order id travels in the subject on purpose: the one person for whom
 * "je reservering is verlopen" is wrong is the one whose payment silently
 * succeeded, and this turns their complaint into a single lookup instead of
 * a shrug.
 */
export default function ContactNote({ orderId }: { orderId: string }) {
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Bestelling ${orderId}`)}`;
  return (
    <p className={styles.note}>
      Heb je toch betaald maar geen tickets ontvangen?{" "}
      <a href={href} className={styles.noteLink}>
        Neem contact met ons op
      </a>
      .
    </p>
  );
}
```

- [ ] **Step 2: Write `SavedOrderCard`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { SavedOrderWithView } from "./useSavedOrders";
import ContactNote from "./ContactNote";
import styles from "./SavedOrders.module.css";

function formatSeats(labels: string[]): string {
  return labels.join(", ");
}

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

export default function SavedOrderCard({
  order,
  onForget,
}: {
  order: SavedOrderWithView;
  onForget: (orderId: string) => void;
}) {
  const { saved, view, isLoading } = order;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [override, setOverride] = useState<"cancelled" | "unknown" | null>(null);

  async function handleResume() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tickets/orders/${saved.orderId}/resume`, { method: "POST" });
      const data = await res.json();
      if (res.status === 429) {
        setError("Te veel pogingen. Probeer het over enkele minuten opnieuw.");
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      } else if (data.state === "paid") {
        window.location.href = `/event/${saved.eventUuid}/ticket/${saved.dateUuid}/confirm?order=${saved.orderId}`;
        return;
      } else if (data.state === "cancelled") {
        setOverride("cancelled");
      } else {
        setOverride("unknown");
      }
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    }
    setBusy(false);
  }

  if (isLoading && !view) {
    return <div className={styles.card}>Je bestelling wordt geladen…</div>;
  }
  if (!view) return null;

  const seats = formatSeats(view.seatLabels.length ? view.seatLabels : saved.seatLabels);
  const header = (
    <>
      <p className={styles.eyebrow}>{view.eventTitle}</p>
      {seats && <p className={styles.seats}>Plaats(en) {seats}</p>}
    </>
  );

  // A resume call that has already told us the outcome outranks the cached
  // query, which will not have refetched yet.
  const state = override === "cancelled" ? "cancelled" : view.state;
  const resumable = override === null && view.state === "pending" && view.resumable;

  if (state === "cancelled") {
    return (
      <div className={styles.card}>
        {header}
        <h2 className={styles.title}>Je reservering is verlopen</h2>
        <p className={styles.copy}>
          Je plaatsen zijn weer vrijgegeven. Kies opnieuw je plaatsen om verder te gaan.
        </p>
        <Link
          href={`/event/${saved.eventUuid}/ticket/${saved.dateUuid}`}
          className={styles.primaryBtn}
        >
          Kies opnieuw
        </Link>
        <ContactNote orderId={saved.orderId} />
        <button type="button" className={styles.dismissBtn} onClick={() => onForget(saved.orderId)}>
          Verbergen
        </button>
      </div>
    );
  }

  if (state === "paid") {
    if (!view.hasTickets) {
      return (
        <div className={styles.card}>
          {header}
          <h2 className={styles.title}>Er is iets misgelopen</h2>
          <p className={styles.copy}>
            Je betaling is gelukt, maar er ging iets mis bij het toewijzen van je plaatsen. We nemen
            binnen het uur contact met je op &mdash; betaal alsjeblieft niet opnieuw.
          </p>
          <ContactNote orderId={saved.orderId} />
        </div>
      );
    }
    return (
      <div className={styles.card}>
        {header}
        <h2 className={styles.title}>Je tickets zijn bevestigd</h2>
        <p className={styles.copy}>
          Check je mailbox &mdash; je tickets met QR-code zijn onderweg. Geen mail gekregen? Check
          je spamfolder of download ze hieronder.
        </p>
        <a href={`/api/tickets/orders/${saved.orderId}/pdf`} className={styles.primaryBtn}>
          Download je tickets (PDF)
        </a>
      </div>
    );
  }

  if (!resumable) {
    return (
      <div className={styles.card}>
        {header}
        <h2 className={styles.title}>Je betaling wordt nog gecontroleerd</h2>
        <p className={styles.copy}>
          Als je betaling gelukt is, ontvang je je tickets zo per mail &mdash; je hoeft niet opnieuw
          te betalen.
        </p>
        <ContactNote orderId={saved.orderId} />
      </div>
    );
  }

  const left = minutesLeft(view.expiresAt);
  return (
    <div className={styles.card}>
      {header}
      <h2 className={styles.title}>Je hebt een lopende bestelling</h2>
      <p className={styles.copy}>
        Je plaatsen staan nog {left} minuut{left === 1 ? "" : "en"} voor je klaar. Rond je betaling
        af van &euro;{(view.totalAmount / 100).toFixed(2)}.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleResume}>
        {busy ? "Bezig…" : "Verder betalen"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write the stylesheet**

Create `components/SavedOrders/SavedOrders.module.css`, reusing the site's existing custom properties (`--noir`, `--cream`, `--gold`, `--font-deco`, `--font-display`, `--font-body`) exactly as [Reserved.module.css](<../../../app/event/[id]/ticket/[dateId]/reserved/Reserved.module.css>) does:

```css
.card {
  border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent);
  background: color-mix(in srgb, var(--noir) 92%, black);
  color: var(--cream);
  font-family: var(--font-body);
  border-radius: 4px;
  padding: 24px;
  margin: 0 auto 16px;
  max-width: 620px;
  text-align: center;
}

.eyebrow {
  font-family: var(--font-deco);
  font-size: 11px;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: var(--gold);
  margin: 0 0 4px;
}

.seats {
  font-size: 13px;
  opacity: 0.75;
  margin: 0 0 12px;
}

.title {
  font-family: var(--font-display);
  font-size: clamp(20px, 2.5vw, 28px);
  font-weight: normal;
  margin: 0 0 8px;
}

.copy {
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;
}

.primaryBtn {
  display: inline-block;
  border: 1px solid var(--gold);
  background: transparent;
  color: var(--gold);
  font-family: var(--font-deco);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 12px 24px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.primaryBtn:hover:not(:disabled) {
  background: var(--gold);
  color: var(--noir);
}

.primaryBtn:disabled {
  opacity: 0.5;
  cursor: default;
}

.dismissBtn {
  display: block;
  margin: 12px auto 0;
  border: none;
  background: none;
  color: var(--cream);
  opacity: 0.5;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.note {
  font-size: 12px;
  opacity: 0.7;
  margin: 16px 0 0;
}

.noteLink {
  color: var(--gold);
}

.error {
  color: #ef4444;
  font-size: 13px;
  margin: 0 0 12px;
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors from `components/SavedOrders/`.

- [ ] **Step 5: Commit**

```bash
git add components/SavedOrders/
git commit -m "feat: add the saved-order card and contact note"
```

---

### Task 11: Mount the banner on the ticket pages

**Files:**
- Create: `components/SavedOrders/SavedOrderBanner.tsx`
- Modify: `app/event/[id]/ticket/page.tsx` (render above `<SectionLabel>Available Dates</SectionLabel>`)
- Modify: `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx` (render above `<SectionLabel>Choose Your Seats</SectionLabel>`)
- Modify: `app/event/[id]/EventClient.tsx:127` (render above `<SectionLabel>Description</SectionLabel>`)

**Interfaces:**
- Consumes: `useSavedOrders`, `useSavedOrdersForDate` (Task 9); `SavedOrderCard` (Task 10).
- Produces: `<SavedOrderBanner dateUuid={…} />` — `dateUuid` optional; omitted shows every saved order.

- [ ] **Step 1: Write the banner**

```tsx
"use client";

import { useState } from "react";
import { useSavedOrdersForDate } from "./useSavedOrders";
import SavedOrderCard from "./SavedOrderCard";
import styles from "./SavedOrders.module.css";

/**
 * Surfaces this browser's saved orders without hijacking navigation. A
 * visitor who just wants to browse is never redirected — the banner offers
 * the way back and they choose.
 */
export default function SavedOrderBanner({ dateUuid }: { dateUuid?: string }) {
  const { orders, forget } = useSavedOrdersForDate(dateUuid);
  const [dismissed, setDismissed] = useState(false);

  const visible = orders.filter((o) => o.view !== undefined);
  if (dismissed || visible.length === 0) return null;

  return (
    <section className={styles.bannerWrap} aria-label="Je bestellingen">
      {visible.map((order) => (
        <SavedOrderCard key={order.saved.orderId} order={order} onForget={forget} />
      ))}
      <button type="button" className={styles.dismissBtn} onClick={() => setDismissed(true)}>
        Sluiten
      </button>
    </section>
  );
}
```

Add to `components/SavedOrders/SavedOrders.module.css`:

```css
.bannerWrap {
  padding: 24px 16px 0;
}
```

- [ ] **Step 2: Mount on the ticket-dates page**

In `app/event/[id]/ticket/page.tsx`, add `import SavedOrderBanner from "@/components/SavedOrders/SavedOrderBanner";` and insert immediately before `<SectionLabel>Available Dates</SectionLabel>`:

```tsx
      <SavedOrderBanner />
```

- [ ] **Step 3: Mount on the seat map**

In `app/event/[id]/ticket/[dateId]/SeatMapClient.tsx`, add the same import and insert immediately before `<SectionLabel>Choose Your Seats</SectionLabel>`:

```tsx
      <SavedOrderBanner dateUuid={dateId as string} />
```

Scoping it to the date is what stops someone quietly buying a second set of seats for a night they already have a live order on.

- [ ] **Step 4: Mount on the event page**

In `app/event/[id]/EventClient.tsx`, add the same import and insert immediately before `<SectionLabel>Description</SectionLabel>` (line 127):

```tsx
      <SavedOrderBanner />
```

Unscoped here: the event page covers every date, so any saved order for any performance is relevant.

- [ ] **Step 5: Verify by hand**

Run `npm run dev`. With a pending order in `localStorage` (from Task 8), open `/event/<id>/ticket` — expect the "Je hebt een lopende bestelling" card with a working **Verder betalen** button. Clear `localStorage` and reload — expect no banner and no layout shift.

- [ ] **Step 6: Commit**

```bash
git add components/SavedOrders/ "app/event/[id]/ticket/page.tsx" "app/event/[id]/ticket/[dateId]/SeatMapClient.tsx" "app/event/[id]/EventClient.tsx"
git commit -m "feat: show saved orders as a banner on the ticket pages"
```

---

### Task 12: `/mijn-tickets`

**Files:**
- Create: `app/mijn-tickets/page.tsx`
- Create: `app/mijn-tickets/MijnTickets.module.css`

**Interfaces:**
- Consumes: `useSavedOrders` (Task 9); `SavedOrderCard` (Task 10).
- Produces: the `/mijn-tickets` route.

- [ ] **Step 1: Write the page**

```tsx
"use client";

import Link from "next/link";
import { useSavedOrders } from "@/components/SavedOrders/useSavedOrders";
import SavedOrderCard from "@/components/SavedOrders/SavedOrderCard";
import styles from "./MijnTickets.module.css";

export default function MijnTicketsPage() {
  const { orders, forget } = useSavedOrders();

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Mijn tickets</h1>

      {orders.length === 0 ? (
        <>
          <p className={styles.copy}>
            We vinden geen bestellingen op dit toestel. Bestellingen worden lokaal bewaard, dus een
            bestelling van een andere browser of telefoon zie je hier niet.
          </p>
          <Link href="/" className={styles.backLink}>
            &larr; Terug naar de site
          </Link>
        </>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => (
            <SavedOrderCard key={order.saved.orderId} order={order} onForget={forget} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `app/mijn-tickets/MijnTickets.module.css`:

```css
.page {
  min-height: 100vh;
  background: var(--noir);
  color: var(--cream);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 96px 32px 64px;
  text-align: center;
  animation: heroFadeUp 0.5s ease-out both;
}

@keyframes heroFadeUp {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.eyebrow {
  font-family: var(--font-deco);
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.45em;
  color: var(--gold);
  margin: 0 0 24px;
  text-transform: uppercase;
}

.title {
  font-family: var(--font-display);
  font-size: clamp(28px, 4.25vw, 48px);
  font-weight: normal;
  line-height: 0.95;
  margin: 0 0 24px;
}

.copy {
  font-size: 15px;
  line-height: 1.7;
  max-width: 520px;
  margin: 0 0 32px;
}

.backLink {
  font-family: var(--font-deco);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--gold);
  text-decoration: none;
}

.backLink:hover {
  text-decoration: underline;
}

.list {
  width: 100%;
  max-width: 660px;
  margin: 32px auto 0;
}
```

- [ ] **Step 3: Verify by hand**

Run `npm run dev` and open `/mijn-tickets` — with saved orders, expect one card each; with `localStorage` cleared, expect the empty-state copy.

- [ ] **Step 4: Commit**

```bash
git add app/mijn-tickets/
git commit -m "feat: add the mijn-tickets overview page"
```

---

### Task 13: End-to-end verification

The SQL guard change from Task 1 cannot be unit-tested — Neon has no local test harness here — so it gets checked against a real database.

**Files:** none.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: PASS, no skipped files.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Resume an abandoned checkout**

Reserve seats, reach Mollie's page, close the tab. Reopen `/event/<id>/ticket/<dateId>`. Expect the banner, then **Verder betalen** → Mollie. Confirm in the database that `orders.payment_started_at` moved and `orders.id` did **not** change.

- [ ] **Step 4: Confirm the protection window still holds after a resume**

The core of Task 1. In browser A, start a checkout and abandon it. Wait ~55 minutes, then resume in A and stop at Mollie's page. In browser B (or a private window), open the same seat map and try to select and check out those same seats.

Expected: B is refused with "One or more seats are no longer available." If B succeeds, the `coalesce` guard is wrong — fix Task 1 before continuing.

- [ ] **Step 5: Expire an order**

Start a checkout, abandon it, and wait out the hour (or set `payment_started_at` back by 2 hours in the database). Reload `/mijn-tickets`.

Expected: the card reads "Je reservering is verlopen", the tickets are back to `available` with `order_id` null, the order is `cancelled`, and the contact note is present.

- [ ] **Step 6: Re-view a completed purchase**

Complete a payment. Reload `/mijn-tickets`. Expect "Je tickets zijn bevestigd" and a PDF download that opens.

- [ ] **Step 7: Simulate the lost redirect**

Complete a payment but close the tab during the Mollie redirect, before the confirm page loads. Open `/mijn-tickets`.

Expected: the card resolves to paid — the status endpoint's reconcile heals it — and the tickets download. This is the failure that previously left a customer with nothing.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: address end-to-end verification findings"
```

---

## Notes for the implementer

- **`getPathId` does not work for the resume route.** It returns the last path segment, which is `"resume"`. Use the `{ params }` argument, as the sibling `pdf` and `resend` routes do.
- **Never trust the client for money.** `resumeOrder` charges `orders.total_amount` as stored. The browser's saved seat labels are for display only.
- **The fake `sql` harness derives guards from the SQL text**, joined with a NUL separator so a clause can never appear present merely because two template fragments abut. Keep that property when you add branches, or a deleted `WHERE` clause will leave the tests green.
- **The confirm page and the banner share one endpoint.** If you change `OrderView`, both consumers change.
