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
