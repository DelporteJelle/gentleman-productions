# SCANNER role — design

Date: 2026-07-29
Status: Implemented

> **Correction (post-implementation):** the "Current role model" section
> below is wrong about `role` being a constraint-free `VARCHAR(50)` — that
> was `scripts/hash-password.ts`'s outdated comment, not the real schema.
> `users.role` is actually a Postgres enum type (`ADMIN`, `USER`, `TEAM`,
> `PARTNER`, `CREATE_ONLY`), and adding `SCANNER` required
> `ALTER TYPE role ADD VALUE 'SCANNER';` against every database that needs
> to create a `SCANNER` account. This was run against the dev database
> (`.env.development.local`) during Task 7 verification. **It still needs
> to be run against any other environment (e.g. production) before a real
> `SCANNER` account can be created there** — the application code deploys
> safely without it (no existing rows use the new value), but user creation
> will fail with `invalid input value for enum role: "SCANNER"` until the
> `ALTER TYPE` runs. See Task 7 in the implementation plan for the exact
> command.

## Problem

Door staff currently need an `ADMIN` account to use `/private/scan`, because
[app/private/scan/layout.tsx](../../../app/private/scan/layout.tsx) and
`POST /api/tickets/scan` both gate on `requireAdminPage()` /
`requireRole(request, ["ADMIN"])`. `ADMIN` also grants ticket
refunds/reservations, post/event/team management, and the full order
dashboard — far more than a door scanner needs. There is no lower-privilege
role for "can scan tickets, nothing else."

## Goal

Add a `SCANNER` role whose only extra privilege (beyond an unauthenticated
visitor) is: open `/private/scan`, see the performance list (including the
customer/order data already returned by the ticket summary endpoint, per
product decision — scanners are allowed to view this), and mark tickets
scanned. Everything else a `SCANNER` account can currently reach through the
existing "any authenticated user" checks must be closed off.

## Current role model

`role` is a free-form `VARCHAR(50)` column on `users`
([scripts/hash-password.ts](../../../scripts/hash-password.ts)), no CHECK
constraint. Two values are used today: `"ADMIN"` and `"CREATE_ONLY"`
(confirmed literal casing —
[docs/superpowers/plans/2026-07-28-ticketing-security-hardening.md](../plans/2026-07-28-ticketing-security-hardening.md)).
Checks are ad-hoc string comparisons
([components/Navigation/Navigation.tsx](../../../components/Navigation/Navigation.tsx),
[lib/server/requireAdminPage.ts](../../../lib/server/requireAdminPage.ts))
and a `requireRole(request, allowedRoles)` helper
([lib/server/api.ts](../../../lib/server/api.ts)) for API routes. No DB
migration is needed to add a third value.

## Approaches considered

**A — Extend the existing string-role checks (chosen).** Add `"SCANNER"` to
the relevant `requireRole`/`role ===` call sites, and close the gap where
content-mutation routes currently accept *any* authenticated user rather
than a specific role. Minimal, consistent with how `CREATE_ONLY` was added,
low risk in auth-critical code.

**B — Capability/permission map** (e.g. `ROLE_PERMISSIONS["SCANNER"] =
["scan:write"]`) replacing string comparisons project-wide. More extensible
for future roles, but a much larger refactor touching every route for a
one-role addition — rejected as overkill (YAGNI) and higher risk of
introducing an auth regression across routes that don't need to change.

## Design

### 1. Scan access

- [app/private/scan/layout.tsx](../../../app/private/scan/layout.tsx):
  replace `requireAdminPage()` with a new `requireRolePage(["ADMIN",
  "SCANNER"])`.
- `POST /api/tickets/scan`
  ([app/api/tickets/scan/route.ts](../../../app/api/tickets/scan/route.ts)):
  `requireRole(request, ["ADMIN", "SCANNER"])`.

### 2. Generalize the page guard helper

[lib/server/requireAdminPage.ts](../../../lib/server/requireAdminPage.ts)
gains `requireRolePage(allowedRoles: string[]): Promise<void>` (redirect to
`/login` if unauthenticated, `/` if the role doesn't match). `requireAdminPage()`
becomes a thin wrapper: `requireRolePage(["ADMIN"])`, so
[app/private/tickets/layout.tsx](../../../app/private/tickets/layout.tsx)
(stays ADMIN-only) needs no change.

### 3. Ticket summary stays shared, gains SCANNER

`GET /api/tickets/summary`
([app/api/tickets/summary/route.ts](../../../app/api/tickets/summary/route.ts)):
`requireRole(request, ["ADMIN", "SCANNER"])`. No new endpoint — the scan
page's performance picker keeps reading this same route. `/private/tickets`
(the page/nav link) stays ADMIN-only per product decision, even though
`SCANNER` can now reach the underlying data via direct API call; this is a
UI-focus choice (keep the scanner's nav to just "Scan"), not a security
boundary.

### 4. Page guards for `/private/posts` and `/private/about`

Today these have **no role check** — any authenticated user can load them
(only the save/delete API calls are permission-checked). Add:

- `app/private/posts/layout.tsx` (new file) and
  `app/private/about/layout.tsx` (new file), each calling
  `requireRolePage(["ADMIN", "CREATE_ONLY"])`.

This closes the gap that would otherwise let `SCANNER` view (though not
edit) the content-management screens.

### 5. Lock down content-mutation endpoints

These routes currently use `requireAuth(request)` — "any authenticated
user" — which was equivalent to "ADMIN or CREATE_ONLY" only because no
other role existed. Adding `SCANNER` would silently grant it write access
unless these are tightened to `requireRole(request, ["ADMIN",
"CREATE_ONLY"])`:

- [app/api/posts/route.ts](../../../app/api/posts/route.ts) — `DELETE`
- [app/api/events/route.ts](../../../app/api/events/route.ts) — `POST`
- [app/api/events/[id]/route.ts](../../../app/api/events/[id]/route.ts) — `PUT`
- [app/api/basic-posts/route.ts](../../../app/api/basic-posts/route.ts) — `POST`
- [app/api/basic-posts/[id]/route.ts](../../../app/api/basic-posts/[id]/route.ts) — `PUT`
- [app/api/team/route.ts](../../../app/api/team/route.ts) — `POST`, `PUT`, `DELETE`
- [app/api/partners/route.ts](../../../app/api/partners/route.ts) — `POST`, `PUT`, `DELETE`
- [app/api/highlight/route.ts](../../../app/api/highlight/route.ts) — `PUT`, `DELETE`

Ticket-admin routes already restricted to `["ADMIN"]` only (reserve,
release, resend, reserved-seat PDF) are untouched — `SCANNER` stays excluded
from those automatically.

### 6. Navigation

[components/Navigation/Navigation.tsx](../../../components/Navigation/Navigation.tsx):
add an `isScanner` check; render the "Scan" link when `isAdmin ||
isScanner`. "Tickets" stays `isAdmin`-only. "Posts"/"About" stay
`hasCreateAccess`-only (unchanged — `SCANNER` was never included there).

### 7. Docs

[SECURITY.md](../../../SECURITY.md): update "The scan endpoint is restricted
to the admin role" to note the `SCANNER` role also has scan access, and
that the ticket-summary endpoint (customer/order data) is shared by both.

## Testing

No existing test suite covers route handlers directly (project tests target
`lib/` helpers — see `lib/server/*.test.ts`); route-level access control here
follows the same manual-verification convention used in
[docs/superpowers/plans/2026-07-28-ticketing-security-hardening.md](../plans/2026-07-28-ticketing-security-hardening.md)
Step 5. Verification checklist for the implementation plan:

- A `SCANNER` account: `/private/scan` loads and can mark a ticket scanned;
  `/private/tickets`, `/private/posts`, `/private/about` all redirect to `/`;
  `POST /api/posts` (delete), `POST /api/events`, `POST /api/team`, etc. all
  return `403`.
- An `ADMIN` account: unchanged access to everything.
- A `CREATE_ONLY` account: unchanged access to posts/about, still redirected
  from `/private/scan` and `/private/tickets`.
- Unauthenticated: unchanged — redirected to `/login` from any `/private/*`
  route, `401` from any protected API route.

## Out of scope

- ~~No DB schema/migration change (`role` has no CHECK constraint).~~
  **Wrong — see the correction note at the top of this document.** `role` is
  a Postgres enum and needed `ALTER TYPE role ADD VALUE 'SCANNER';`.
- No user-management UI — `SCANNER` accounts are provisioned the same
  manual-SQL way as `ADMIN`/`CREATE_ONLY` today.
- No change to ticket-admin routes already restricted to `["ADMIN"]`
  (reserve, release, resend, reserved-seat PDF).
- No capability/permission-map refactor (Approach B, rejected above).
