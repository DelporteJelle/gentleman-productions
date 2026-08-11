# SCANNER Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SCANNER` role that can open `/private/scan` and mark tickets scanned, and nothing else — while closing the pre-existing gap where several content-mutation API routes accept *any* authenticated user regardless of role.

**Architecture:** Extend the existing ad-hoc string-role checks (`role === "ADMIN"`, `requireRole(request, [...])`) rather than introducing a new permission framework. A page-level guard helper (`requireRolePage`) generalizes the current `requireAdminPage()`. **Correction found during Task 7:** `users.role` is actually a Postgres enum, not a constraint-free column — see the updated Global Constraints entry below.

**Tech Stack:** Next.js App Router (server components + route handlers), `jsonwebtoken` for the session cookie, Neon Postgres via `@neondatabase/serverless`.

## Global Constraints

- Role string literals are exact and case-sensitive: `"ADMIN"`, `"CREATE_ONLY"`, `"SCANNER"` (all uppercase). Never guess a different casing.
- ~~No database schema change. `users.role` is `VARCHAR(50)` with no constraint~~ — **wrong, corrected during Task 7**: `users.role` is a Postgres enum type (`ADMIN`, `USER`, `TEAM`, `PARTNER`, `CREATE_ONLY` at the start of this plan). Adding a `SCANNER` account requires `ALTER TYPE role ADD VALUE 'SCANNER';` to have been run against that database first (one-time, per environment), then a normal `INSERT`/`UPDATE` on `users.role`.
- Every task must pass `npx tsc --noEmit -p .` before it is considered done — this repo has no route-handler test suite, so the type checker is the fast automated gate; manual verification (Task 7) is the correctness gate for auth behavior.
- Don't touch the ticket-admin routes already restricted to `["ADMIN"]` only (reserve, release, resend, reserved-seat PDF) — `SCANNER` must stay excluded from those.

---

### Task 1: Generalize the page-guard helper

**Files:**
- Modify: `lib/server/requireAdminPage.ts` (whole file, currently 14 lines)

**Interfaces:**
- Produces: `requireRolePage(allowedRoles: string[]): Promise<void>` — redirects to `/login` if unauthenticated, to `/` if `user.role` is not in `allowedRoles`. Used by Tasks 2 and 3.
- Produces: `requireAdminPage(): Promise<void>` — unchanged signature/behavior, now implemented as `requireRolePage(["ADMIN"])`. Existing caller `app/private/tickets/layout.tsx` needs no change.

- [ ] **Step 1: Replace the file contents**

```ts
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server-component guard for role-restricted pages under /private.
 *
 * Applied per route segment rather than on app/private/layout.tsx, because
 * different roles legitimately reach different subtrees (e.g. CREATE_ONLY
 * accounts use /private/about and /private/posts; SCANNER accounts use
 * /private/scan).
 */
export async function requireRolePage(allowedRoles: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowedRoles.includes(user.role)) redirect("/");
}

/** Convenience wrapper for the common admin-only case. */
export async function requireAdminPage(): Promise<void> {
  return requireRolePage(["ADMIN"]);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors (in particular, `app/private/tickets/layout.tsx` — the only other caller of `requireAdminPage` — still compiles unchanged).

- [ ] **Step 3: Commit**

```bash
git add lib/server/requireAdminPage.ts
git commit -m "refactor: generalize requireAdminPage into requireRolePage"
```

---

### Task 2: Grant SCANNER access to the scan page and its two API routes

**Files:**
- Modify: `app/private/scan/layout.tsx` (whole file, 6 lines)
- Modify: `app/api/tickets/scan/route.ts:5`
- Modify: `app/api/tickets/summary/route.ts:4`

**Interfaces:**
- Consumes: `requireRolePage` from Task 1 (`@/lib/server/requireAdminPage`).
- Consumes: `requireRole(request: Request, allowedRoles: string[]): NextResponse | null` from `@/lib/server/api` (already imported in both route files — no import changes needed here).

- [ ] **Step 1: Update the scan page layout**

Replace `app/private/scan/layout.tsx` in full:

```ts
import { requireRolePage } from "@/lib/server/requireAdminPage";

export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(["ADMIN", "SCANNER"]);
  return <>{children}</>;
}
```

- [ ] **Step 2: Update the scan API route**

In `app/api/tickets/scan/route.ts`, line 5:

```ts
  const authError = requireRole(request, ["ADMIN"]);
```

becomes:

```ts
  const authError = requireRole(request, ["ADMIN", "SCANNER"]);
```

- [ ] **Step 3: Update the ticket summary API route**

In `app/api/tickets/summary/route.ts`, line 4:

```ts
  const authError = requireRole(request, ["ADMIN"]);
```

becomes:

```ts
  const authError = requireRole(request, ["ADMIN", "SCANNER"]);
```

(This is the route the scan page's performance picker reads. `SCANNER` gaining this also means it can see the customer/order fields this route returns — that's intentional, per product decision; see the design spec's "Ticket summary stays shared" section.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/private/scan/layout.tsx app/api/tickets/scan/route.ts app/api/tickets/summary/route.ts
git commit -m "feat: allow SCANNER role to use the door scanner"
```

---

### Task 3: Guard the posts and about pages

**Files:**
- Create: `app/private/posts/layout.tsx`
- Create: `app/private/about/layout.tsx`

**Interfaces:**
- Consumes: `requireRolePage` from Task 1.

Today these two routes have no role check at all beyond "is logged in" (from `app/private/layout.tsx`). A `SCANNER` account could otherwise load these pages (though every save/delete call was already permission-checked before this plan, and will be further tightened in Task 4).

- [ ] **Step 1: Create the posts layout guard**

```ts
import { requireRolePage } from "@/lib/server/requireAdminPage";

export default async function PostsLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(["ADMIN", "CREATE_ONLY"]);
  return <>{children}</>;
}
```

Save as `app/private/posts/layout.tsx`.

- [ ] **Step 2: Create the about layout guard**

```ts
import { requireRolePage } from "@/lib/server/requireAdminPage";

export default async function AboutLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(["ADMIN", "CREATE_ONLY"]);
  return <>{children}</>;
}
```

Save as `app/private/about/layout.tsx`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/private/posts/layout.tsx app/private/about/layout.tsx
git commit -m "feat: restrict /private/posts and /private/about to ADMIN and CREATE_ONLY"
```

---

### Task 4: Lock down content-mutation API routes to ADMIN/CREATE_ONLY

**Files:**
- Modify: `app/api/posts/route.ts` (import block + line 101)
- Modify: `app/api/events/route.ts` (import block + line 26)
- Modify: `app/api/events/[id]/route.ts` (import block + line 37)
- Modify: `app/api/basic-posts/route.ts` (import block + line 25)
- Modify: `app/api/basic-posts/[id]/route.ts` (import block + line 36)
- Modify: `app/api/team/route.ts` (import block + lines 26, 68, 110)
- Modify: `app/api/partners/route.ts` (import block + lines 26, 61, 97)
- Modify: `app/api/highlight/route.ts` (import block + lines 46, 85)

**Interfaces:**
- Consumes: `requireRole(request: Request, allowedRoles: string[]): NextResponse | null` from `@/lib/server/api` (already exists — used elsewhere in the codebase, e.g. `app/api/tickets/scan/route.ts`).

These routes currently use `requireAuth(request)` — "any authenticated user" — on every mutating handler. That was equivalent to "ADMIN or CREATE_ONLY" only because no other role existed yet. Without this task, a `SCANNER` account could create/edit/delete posts, events, team members, partners, and the highlight via direct API calls, which contradicts "SCANNER's only extra privilege is scanning."

The change is the same two-part edit in all 8 files: swap `requireAuth` for `requireRole` in the import list, and swap each `requireAuth(request)` call for `requireRole(request, ["ADMIN", "CREATE_ONLY"])`. None of these files use `requireAuth` anywhere else (their `GET` handlers are unauthenticated on purpose — public read access), so the import is fully replaced, not added alongside.

- [ ] **Step 1: `app/api/posts/route.ts`**

Import block (top of file) — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireAuth,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireRole,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Line 101 — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

- [ ] **Step 2: `app/api/events/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Line 26 — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

- [ ] **Step 3: `app/api/events/[id]/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  getPathId,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  getPathId,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Line 37 — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

- [ ] **Step 4: `app/api/basic-posts/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Line 25 — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

- [ ] **Step 5: `app/api/basic-posts/[id]/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  getPathId,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  getPathId,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Line 36 — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

- [ ] **Step 6: `app/api/team/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Lines 26, 68, and 110 each — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

(three occurrences: `POST`, `PUT`, `DELETE`)

- [ ] **Step 7: `app/api/partners/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireAuth,
  parseBody,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  requireRole,
  parseBody,
  getQueryParam,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Lines 26, 61, and 97 each — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

(three occurrences: `POST`, `PUT`, `DELETE`)

- [ ] **Step 8: `app/api/highlight/route.ts`**

Import block — replace:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireAuth,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

with:

```ts
import {
  getDb,
  jsonResponse,
  errorResponse,
  cachedResponse,
  requireRole,
  parseBody,
  invalidateCache,
  CacheTags,
} from "@/lib/server/api";
```

Lines 46 and 85 each — replace:

```ts
  const authError = requireAuth(request);
```

with:

```ts
  const authError = requireRole(request, ["ADMIN", "CREATE_ONLY"]);
```

(two occurrences: `PUT`, `DELETE`)

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors. If `requireAuth` shows an "unused import" situation elsewhere, that's a signal a file still needs its call site swapped — recheck that file's line numbers above (line numbers assume no other edits have shifted the file).

- [ ] **Step 10: Commit**

```bash
git add app/api/posts/route.ts app/api/events/route.ts "app/api/events/[id]/route.ts" app/api/basic-posts/route.ts "app/api/basic-posts/[id]/route.ts" app/api/team/route.ts app/api/partners/route.ts app/api/highlight/route.ts
git commit -m "fix: require ADMIN or CREATE_ONLY for content-mutation routes"
```

---

### Task 5: Show the Scan link to SCANNER accounts

**Files:**
- Modify: `components/Navigation/Navigation.tsx:17-18` and `:48-55`

**Interfaces:**
- Consumes: nothing new — `userRole` is already fetched via the existing `useQuery(["auth-me"])` call in this component.

- [ ] **Step 1: Add an `isScanner` flag**

Line 17-18 currently:

```ts
  const hasCreateAccess = userRole === "ADMIN" || userRole === "CREATE_ONLY";
  const isAdmin = userRole === "ADMIN";
```

becomes:

```ts
  const hasCreateAccess = userRole === "ADMIN" || userRole === "CREATE_ONLY";
  const isAdmin = userRole === "ADMIN";
  const isScanner = userRole === "SCANNER";
```

- [ ] **Step 2: Widen the Scan link condition**

Lines 48-55 currently:

```tsx
      {isAdmin && (
        <a
          href="/private/scan"
          className={pathname === "/private/scan" ? "active" : ""}
        >
          Scan
        </a>
      )}
```

becomes:

```tsx
      {(isAdmin || isScanner) && (
        <a
          href="/private/scan"
          className={pathname === "/private/scan" ? "active" : ""}
        >
          Scan
        </a>
      )}
```

(Leave the "Tickets" link above it — lines 39-46 — untouched: it stays `hasCreateAccess`-independent and `isAdmin`-only, per the design decision to keep the Tickets dashboard nav link ADMIN-only.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/Navigation/Navigation.tsx
git commit -m "feat: show Scan nav link to SCANNER accounts"
```

---

### Task 6: Update SECURITY.md

**Files:**
- Modify: `SECURITY.md:183`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update the scan-endpoint note**

Current (end of the "Ticket Security" section):

```md
- The scan endpoint is restricted to the admin role and is scoped to a single
  performance chosen by the operator.
```

Replace with:

```md
- The scan endpoint is restricted to the `ADMIN` and `SCANNER` roles and is
  scoped to a single performance chosen by the operator. The ticket-summary
  endpoint it depends on for the performance list (`GET
  /api/tickets/summary`, including customer/order data) is shared by both
  roles; the `/private/tickets` order-management page and its nav link
  remain `ADMIN`-only.
```

- [ ] **Step 2: Commit**

```bash
git add SECURITY.md
git commit -m "docs: document the SCANNER role's access in SECURITY.md"
```

---

### Task 7: Manual end-to-end verification

**Files:** none — this task provisioned temporary test accounts and exercised the running app via `curl`. No automated route-handler tests exist in this repo (confirmed: `lib/**/*.test.ts` covers helpers only), so this manual pass was the correctness gate for the auth changes in Tasks 1-6.

**Interfaces:** none.

**As executed (2026-07-29):**

- [x] **Step 0 (unplanned): environment discovery.** `.env.local` and `.env.development.local` hold **different `DATABASE_URL` values**; `next dev` actually loads `.env.development.local` (Next.js's precedence puts it ahead of `.env.local`). An initial attempt against `.env.local`'s database was therefore pointed at the wrong DB. It was confirmed with the project owner that `.env.development.local` is the real dev database; the stray test row created against `.env.local`'s DB was deleted (the harmless-but-irreversible `ALTER TYPE role ADD VALUE 'SCANNER'` run there first was left in place — see the correction note in the design spec).
- [x] **Step 0b (unplanned): enum discovery.** `users.role` is a Postgres enum (`ADMIN`, `USER`, `TEAM`, `PARTNER`, `CREATE_ONLY`), not the constraint-free `VARCHAR(50)` the spec assumed. Ran `ALTER TYPE role ADD VALUE IF NOT EXISTS 'SCANNER';` against `.env.development.local`'s database before a `SCANNER` row could be inserted. **This must also be run against any other environment (e.g. production) before it can hold a real `SCANNER` account.**
- [x] **Step 1: Create temporary test accounts** — one each for `SCANNER`, `ADMIN`, and `CREATE_ONLY` (`scanner_test_verify`, `admin_test_verify`, `createonly_test_verify`), inserted directly against `.env.development.local`'s database with a shared bcrypt password hash.
- [x] **Step 2: Dev server** — already running on `localhost:3000`; reused rather than starting a second instance.
- [x] **Step 3: SCANNER's allowed access** — logged in via `POST /api/auth/login`, confirmed via `GET /api/auth/me` that the session reports `"role":"SCANNER"`. `GET /private/scan` → `200`. `GET /api/tickets/summary` → `200`. `POST /api/tickets/scan` (bogus token) → `200` (rejected at the ticket-validation layer, not the auth layer — confirms the role check passes through).
- [x] **Step 4: SCANNER's blocked access** — `GET /private/tickets`, `/private/posts`, `/private/about` → `307` redirect to `/`. All of `DELETE /api/posts`, `POST /api/events`, `PUT /api/events/[id]`, `POST /api/basic-posts`, `PUT /api/basic-posts/[id]`, `POST|PUT|DELETE /api/team`, `POST|PUT|DELETE /api/partners`, `PUT|DELETE /api/highlight` → `403`.
- [x] **Step 5: ADMIN unaffected** — all four private pages → `200`; `GET /api/tickets/summary` → `200`; `DELETE /api/posts` → `200`.
- [x] **Step 6: CREATE_ONLY unaffected** — `/private/about`, `/private/posts` → `200`; `/private/scan`, `/private/tickets` → `307` to `/` (unchanged from before this plan); `DELETE /api/posts` → `200` (CREATE_ONLY can still mutate content); `GET /api/tickets/summary` → `403` (unchanged — never had ticket access).
- [x] **Step 6b: Unauthenticated baseline** — `GET /private/scan` (no cookie) → `307` to `/login`; `GET /api/tickets/summary` → `401`; `DELETE /api/posts` → `401`. Unchanged from before this plan.
- [x] **Step 7: Clean up** — deleted all three temporary accounts (`scanner_test_verify`, `admin_test_verify`, `createonly_test_verify`) from `.env.development.local`'s database, and removed the scratch `scripts/_tmp-*.ts` helper scripts used to run these checks (never committed).
- [x] **Step 8: Report results** — every check passed. See the correction notes above and in the design spec for the one follow-up required before production use: run `ALTER TYPE role ADD VALUE 'SCANNER';` against any other environment's database before creating a real `SCANNER` account there.
