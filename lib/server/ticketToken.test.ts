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
