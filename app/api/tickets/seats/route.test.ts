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
}

const ROWS: FakeRow[] = [
  { id: "t-free", status: "available", seat_row: "A", seat_number: 1 },
  { id: "t-sold", status: "sold", seat_row: "A", seat_number: 2 },
  { id: "t-off", status: "disabled", seat_row: "A", seat_number: 3 },
];

let lastSql = "";

function installFakeSql() {
  mocks.sqlImpl = (async (strings: TemplateStringsArray) => {
    lastSql = strings.join(" ");
    // MODELS the WHERE clause rather than executing it — so the assertions
    // below also pin the SQL text, or they would pass against a query that
    // never filtered anything.
    const hidesDisabled = lastSql.includes("t.status <> 'disabled'");
    const exposesDisabledIds = lastSql.includes("t.status IN ('available','disabled')");
    return ROWS.filter((r) => !(hidesDisabled && r.status === "disabled")).map((r) => ({
      id:
        r.status === "available" || (r.status === "disabled" && exposesDisabledIds)
          ? r.id
          : null,
      status: r.status,
      held_until: null,
      seat_kind: null,
      wheelchair_group_id: null,
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
    const body = (await res.json()) as { status: string }[];

    expect(lastSql).toContain("t.status <> 'disabled'");
    expect(body.map((t) => t.status)).toEqual(["available", "sold"]);
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
    mocks.authPayload = { id: "u1", username: "admin", role: "ADMIN" };
    const res = await GET(request());
    const body = (await res.json()) as { id: string | null; status: string }[];

    expect(body.find((t) => t.status === "sold")!.id).toBeNull();
  });

  it("400s without a date_uuid", async () => {
    const res = await GET(new Request("http://localhost/api/tickets/seats"));
    expect(res.status).toBe(400);
  });
});
