import { createHash, randomBytes } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Event, EventDateEntry } from "@/types";
import { isDateEnded, isDateOpen } from "@/lib/dateAvailability";

type Sql = NeonQueryFunction<false, false>;

export const PRIVATE_TICKET_COOKIE = "private_ticket_access";
export const PRIVATE_LINK_SESSION_SECONDS = 60 * 60 * 24 * 30;

export interface PrivateTicketLinkRow {
  id: string;
  event_uuid: string;
  date_uuid: string;
  token_hash: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  ticket_limit: number | null;
  allocated_tickets: number;
  created_at: string;
}

export interface DateAccess {
  allowed: boolean;
  privateLinkId: string | null;
  tokenHash: string | null;
}

export function createPrivateTicketToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPrivateTicketToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readPrivateTicketToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PRIVATE_TICKET_COOKIE}=`));
  if (!entry) return null;
  const token = entry.slice(PRIVATE_TICKET_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{40,60}$/.test(token) ? token : null;
}

export async function getDateAccess(
  sql: Sql,
  request: Request,
  event: Event,
  date: EventDateEntry,
): Promise<DateAccess> {
  if (isDateEnded(date)) {
    return { allowed: false, privateLinkId: null, tokenHash: null };
  }
  if (isDateOpen(event, date)) {
    return { allowed: true, privateLinkId: null, tokenHash: null };
  }
  if (typeof date.price !== "number") {
    return { allowed: false, privateLinkId: null, tokenHash: null };
  }

  const token = readPrivateTicketToken(request);
  if (!token) return { allowed: false, privateLinkId: null, tokenHash: null };
  const tokenHash = hashPrivateTicketToken(token);
  const rows = await sql`
    SELECT id
    FROM private_ticket_links
    WHERE event_uuid = ${event.uuid}
      AND date_uuid = ${date.uuid}
      AND token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;
  `;
  const row = rows[0] as { id: string } | undefined;
  return row
    ? { allowed: true, privateLinkId: row.id, tokenHash }
    : { allowed: false, privateLinkId: null, tokenHash: null };
}

/** Atomically reserves private allocation and marks the order as its owner. */
export async function reservePrivateTicketCapacity(
  sql: Sql,
  orderId: string,
  linkId: string,
  tokenHash: string,
  seatCount: number,
): Promise<boolean> {
  const rows = await sql`
    WITH eligible_order AS MATERIALIZED (
      SELECT id, private_link_id
        FROM orders
       WHERE id = ${orderId}
         AND private_link_id = ${linkId}
         AND status = 'pending'
         AND private_capacity_reserved = false
       FOR UPDATE
    ), reserved AS (
      UPDATE private_ticket_links l
         SET allocated_tickets = l.allocated_tickets + ${seatCount}
        FROM eligible_order o
       WHERE l.id = o.private_link_id
         AND token_hash = ${tokenHash}
         AND l.revoked_at IS NULL
         AND (l.expires_at IS NULL OR l.expires_at > now())
         AND (l.ticket_limit IS NULL OR l.allocated_tickets + ${seatCount} <= l.ticket_limit)
       RETURNING l.id
    )
    UPDATE orders o
       SET private_capacity_reserved = true
      FROM eligible_order e, reserved r
     WHERE o.id = ${orderId}
       AND o.id = e.id
       AND o.private_link_id = r.id
       AND o.status = 'pending'
    RETURNING o.id;
  `;
  return rows.length === 1;
}

/**
 * Return an order's reserved allocation exactly once. The order flag and
 * counter update happen in one statement, including compensation paths where
 * the pending order is deleted immediately afterward.
 */
export async function releasePrivateTicketCapacity(
  sql: Sql,
  orderId: string,
): Promise<void> {
  await sql`
    WITH released AS (
      UPDATE orders
         SET private_capacity_reserved = false
       WHERE id = ${orderId}
         AND status <> 'paid'
         AND private_link_id IS NOT NULL
         AND private_ticket_count > 0
         AND private_capacity_reserved = true
       RETURNING private_link_id, private_ticket_count
    )
    UPDATE private_ticket_links l
       SET allocated_tickets = greatest(0, l.allocated_tickets - r.private_ticket_count)
      FROM released r
     WHERE l.id = r.private_link_id;
  `;
}

/** Cancel a pending order and release its private allocation in one statement. */
export async function cancelPendingOrder(
  sql: Sql,
  orderId: string,
): Promise<void> {
  await sql`
    WITH cancelled AS (
      UPDATE orders
         SET status = 'cancelled', private_capacity_reserved = false
       WHERE id = ${orderId}
         AND status = 'pending'
         AND private_capacity_reserved = true
       RETURNING private_link_id, private_ticket_count
    )
    UPDATE private_ticket_links l
       SET allocated_tickets = greatest(0, l.allocated_tickets - c.private_ticket_count)
      FROM cancelled c
     WHERE l.id = c.private_link_id;
  `;
  await sql`
    UPDATE orders SET status = 'cancelled'
    WHERE id = ${orderId} AND status = 'pending' AND private_capacity_reserved = false;
  `;
}

