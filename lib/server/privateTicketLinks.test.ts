import { describe, expect, it, vi } from "vitest";
import { DbObjectType, type Event, type EventDateEntry } from "@/types";
import {
  createPrivateTicketToken,
  getDateAccess,
  hashPrivateTicketToken,
  readPrivateTicketToken,
  releasePrivateTicketCapacity,
  reservePrivateTicketCapacity,
} from "./privateTicketLinks";

const event: Event = {
  uuid: "event-1",
  created_at: "2026-01-01T00:00:00Z",
  title: "Private show",
  post_type: DbObjectType.EVENT,
  description: "A show",
  display_image: "image.jpg",
  tickets_open: false,
  dates: [],
};

const date: EventDateEntry = {
  uuid: "date-1",
  start_time: "2026-12-01T19:00:00Z",
  end_time: "2026-12-01T21:00:00Z",
  timeLine: [],
  price: 20,
  tickets_open: false,
};

describe("private ticket link credentials", () => {
  it("creates unguessable URL-safe tokens and stores a one-way hash", () => {
    const token = createPrivateTicketToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(hashPrivateTicketToken(token)).toHaveLength(64);
    expect(hashPrivateTicketToken(token)).not.toContain(token);
  });

  it("reads only a well-formed private access cookie", () => {
    const token = createPrivateTicketToken();
    expect(readPrivateTicketToken(new Request("http://localhost", {
      headers: { cookie: `other=x; private_ticket_access=${token}` },
    }))).toBe(token);
    expect(readPrivateTicketToken(new Request("http://localhost", {
      headers: { cookie: "private_ticket_access=short" },
    }))).toBeNull();
  });

  it("does not query private links for a publicly open date", async () => {
    const sql = vi.fn() as never;
    const openEvent = { ...event, dates: [{ ...date, tickets_open: true }] };
    await expect(getDateAccess(sql, new Request("http://localhost"), openEvent, openEvent.dates[0]))
      .resolves.toEqual({ allowed: true, privateLinkId: null, tokenHash: null });
    expect(sql).not.toHaveBeenCalled();
  });

  it("matches a closed date only when the anonymous cookie hashes to its active link", async () => {
    const token = createPrivateTicketToken();
    const sql = vi.fn(async () => [{ id: "private-link-1" }]) as never;
    const result = await getDateAccess(
      sql,
      new Request("http://localhost", { headers: { cookie: `private_ticket_access=${token}` } }),
      event,
      date,
    );
    expect(result).toEqual({
      allowed: true,
      privateLinkId: "private-link-1",
      tokenHash: hashPrivateTicketToken(token),
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("reserves the configured allocation atomically and releases it once per order", async () => {
    const sql = vi.fn(async () => [{ id: "order-1" }]) as never;
    await expect(reservePrivateTicketCapacity(sql, "order-1", "link-1", "hash", 2)).resolves.toBe(true);
    const reservationSql = String((sql as ReturnType<typeof vi.fn>).mock.calls[0][0].join(" "));
    expect(reservationSql).toContain("allocated_tickets +");
    expect(reservationSql).toContain("ticket_limit");
    expect(reservationSql).toContain("private_capacity_reserved = true");

    await releasePrivateTicketCapacity(sql, "order-1");
    const releaseSql = String((sql as ReturnType<typeof vi.fn>).mock.calls[1][0].join(" "));
    expect(releaseSql).toContain("private_capacity_reserved = false");
    expect(releaseSql).toContain("greatest(0");
  });
});
