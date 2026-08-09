import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// GET /api/tickets/seats — the audience split is a security boundary: a
// disabled seat must not exist as far as a customer is concerned, and that has
// to be true of the payload, not just of the rendering.
//
// Only `getDb` and `verifyAuth` are swapped out; the route runs for real.
// ============================================================================

const mocks = vi.hoisted(() => ({
  sqlImpl: null as unknown as (...args: unknown[]) => unknown,
  authPayload: null as { id: string; username: string; role: string } | null,
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    getDb: () => mocks.sqlImpl,
    verifyAuth: () => mocks.authPayload,
  };
});

import { GET } from "./route";

interface FakeRow {
  id: string;
  status: string;
  seat_row: string;
  seat_number: number;
  held_until: string | null;
  seat_kind: string | null;
  wheelchair_group_id: string | null;
}

const ROWS: FakeRow[] = [
  { id: "t-free", status: "available", seat_row: "A", seat_number: 1, held_until: null, seat_kind: null, wheelchair_group_id: null },
  // Enriched with non-null pass-through fields (a plausible wheelchair seat
  // that stayed marked sold with its group id) so the mapper's field-by-field
  // pass-through is actually exercised somewhere, not just hardcoded by the
  // stub the way it was before. Its id stays withheld either way ('sold' is
  // never id-eligible for either audience), so enriching it can't interfere
  // with the id-eligibility assertions.
  { id: "t-sold", status: "sold", seat_row: "B", seat_number: 4, held_until: "2026-08-09T12:00:00Z", seat_kind: "wheelchair", wheelchair_group_id: "wg-1" },
  { id: "t-off", status: "disabled", seat_row: "A", seat_number: 3, held_until: null, seat_kind: null, wheelchair_group_id: null },
];

let lastSql = "";

/**
 * Parses the id-eligible statuses out of the route's actual `CASE WHEN
 * t.status = '...' | IN (...) THEN t.id::text ELSE NULL END` — mirroring the
 * SQL rather than hardcoding "available exposes an id, sold doesn't". If
 * `route.ts`'s CASE ever changed which statuses get an id — in either
 * direction — this derivation changes with it, so a test built on top of it
 * actually depends on the real SQL text instead of passing regardless of what
 * it says.
 */
function idEligibleStatuses(sql: string): string[] {
  const inMatch = sql.match(/WHEN\s+t\.status\s+IN\s*\(([^)]*)\)/);
  if (inMatch) {
    return inMatch[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  }
  const eqMatch = sql.match(/WHEN\s+t\.status\s*=\s*'([^']+)'/);
  return eqMatch ? [eqMatch[1]] : [];
}

function installFakeSql() {
  mocks.sqlImpl = (async (strings: TemplateStringsArray) => {
    lastSql = strings.join(" ");
    // MODELS the WHERE clause and the CASE's id-eligibility list rather than
    // executing either — so the assertions below also pin the SQL text (for
    // the WHERE) or derive from it (for the CASE, via idEligibleStatuses), or
    // they would pass against a query that never filtered or exposed
    // anything.
    const hidesDisabled = lastSql.includes("t.status <> 'disabled'");
    const eligible = idEligibleStatuses(lastSql);
    return ROWS.filter((r) => !(hidesDisabled && r.status === "disabled")).map((r) => ({
      id: eligible.includes(r.status) ? r.id : null,
      status: r.status,
      held_until: r.held_until,
      seat_kind: r.seat_kind,
      wheelchair_group_id: r.wheelchair_group_id,
      seat_id: `s-${r.seat_number}`,
      seat_row: r.seat_row,
      seat_number: r.seat_number,
    }));
  }) as unknown as typeof mocks.sqlImpl;
}

const request = () => new Request("http://localhost/api/tickets/seats?date_uuid=date-1");

beforeEach(() => {
  lastSql = "";
  mocks.authPayload = null;
  installFakeSql();
});

describe("GET /api/tickets/seats", () => {
  it("omits disabled seats entirely for an anonymous caller", async () => {
    const res = await GET(request());
    const body = (await res.json()) as { id: string | null; status: string }[];

    expect(lastSql).toContain("t.status <> 'disabled'");
    expect(body.map((t) => t.status)).toEqual(["available", "sold"]);
    expect(body.find((t) => t.status === "available")!.id).toBe("t-free");
    expect(body.find((t) => t.status === "sold")!.id).toBeNull();
  });

  it("omits them for a signed-in non-admin too", async () => {
    mocks.authPayload = { id: "u1", username: "scanner", role: "SCANNER" };
    const res = await GET(request());
    const body = (await res.json()) as { status: string }[];

    expect(lastSql).toContain("t.status <> 'disabled'");
    expect(body.some((t) => t.status === "disabled")).toBe(false);
  });

  it("gives an admin the disabled seats, with ids so they can be re-enabled", async () => {
    mocks.authPayload = { id: "u1", username: "admin", role: "ADMIN" };
    const res = await GET(request());
    const body = (await res.json()) as { id: string | null; status: string }[];

    expect(lastSql).not.toContain("t.status <> 'disabled'");
    const off = body.find((t) => t.status === "disabled");
    expect(off).toBeDefined();
    expect(off!.id).toBe("t-off");
  });

  it("still withholds ids for sold seats, admin or not", async () => {
    for (const auth of [
      null,
      { id: "u1", username: "scanner", role: "SCANNER" },
      { id: "u1", username: "admin", role: "ADMIN" },
    ]) {
      mocks.authPayload = auth;
      const res = await GET(request());
      const body = (await res.json()) as { id: string | null; status: string }[];

      expect(body.find((t) => t.status === "sold")!.id).toBeNull();
    }
  });

  it("passes seat coordinates and the held_until/seat_kind/wheelchair_group_id fields through unchanged", async () => {
    const res = await GET(request());
    const body = (await res.json()) as {
      status: string;
      held_until: string | null;
      seat_kind: string | null;
      wheelchair_group_id: string | null;
      seat: { id: string; row: string; seat_number: number };
    }[];

    const sold = body.find((t) => t.status === "sold")!;
    expect(sold.held_until).toBe("2026-08-09T12:00:00Z");
    expect(sold.seat_kind).toBe("wheelchair");
    expect(sold.wheelchair_group_id).toBe("wg-1");
    expect(sold.seat).toEqual({ id: "s-4", row: "B", seat_number: 4 });
  });

  it("400s without a date_uuid", async () => {
    const res = await GET(new Request("http://localhost/api/tickets/seats"));
    expect(res.status).toBe(400);
  });
});
