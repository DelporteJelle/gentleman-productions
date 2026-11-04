import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sqlImpl: null as unknown as (...args: unknown[]) => unknown,
  authError: null as Response | null,
  requestedRoles: [] as string[],
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/api")>();
  return {
    ...actual,
    getDb: () => mocks.sqlImpl,
    requireRole: (_request: Request, roles: string[]) => {
      mocks.requestedRoles = roles;
      return mocks.authError;
    },
  };
});

import { GET } from "./route";

const EVENT_UUID = "00000000-0000-4000-8000-000000000001";
const DATE_UUID = "00000000-0000-4000-8000-000000000002";
const EMAIL_ROWS = [
  { customer_email: "ada@example.com" },
  { customer_email: "grace@example.com" },
];

function installFakeSql(rows: { customer_email: string }[] = EMAIL_ROWS) {
  mocks.sqlImpl = (async (strings: TemplateStringsArray) => {
    const query = strings.join("?").trim().replace(/\s+/g, " ");
    if (!query.startsWith("SELECT DISTINCT customer_email FROM orders")) {
      throw new Error(`Unhandled fake SQL: ${query}`);
    }
    expect(query).toContain("status = 'paid'");
    expect(query).toContain("reserved_by_admin = false");
    return rows;
  }) as typeof mocks.sqlImpl;
}

function request() {
  return new Request(
    `http://localhost/api/tickets/admin/recipients/${EVENT_UUID}/${DATE_UUID}`,
  );
}

beforeEach(() => {
  mocks.authError = null;
  mocks.requestedRoles = [];
  installFakeSql();
});

describe("GET /api/tickets/admin/recipients/[eventUuid]/[dateUuid]", () => {
  it("returns the distinct paid customer emails for the event date", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emails: ["ada@example.com", "grace@example.com"] });
  });

  it("returns an empty list when the date has no paid customer orders", async () => {
    installFakeSql([]);
    const response = await GET(request(), {
      params: Promise.resolve({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID }),
    });

    expect(await response.json()).toEqual({ emails: [] });
  });

  it("requires the admin role", async () => {
    mocks.authError = Response.json({ error: "Forbidden" }, { status: 403 });
    const response = await GET(request(), {
      params: Promise.resolve({ eventUuid: EVENT_UUID, dateUuid: DATE_UUID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.requestedRoles).toEqual(["ADMIN"]);
  });

  it("rejects invalid event or date UUIDs", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ eventUuid: EVENT_UUID, dateUuid: "invalid" }),
    });

    expect(response.status).toBe(400);
  });
});
