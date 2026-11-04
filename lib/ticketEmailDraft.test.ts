import { describe, expect, it } from "vitest";
import { buildTicketBuyerEmailDraft } from "./ticketEmailDraft";

describe("buildTicketBuyerEmailDraft", () => {
  it("builds a BCC draft and encodes recipient addresses", () => {
    const draft = buildTicketBuyerEmailDraft(["ada@example.com", "grace+show@example.com"]);
    expect(draft).toBe("mailto:?bcc=ada%40example.com%2Cgrace%2Bshow%40example.com");
  });

  it("deduplicates and trims recipient addresses", () => {
    const draft = buildTicketBuyerEmailDraft([" ada@example.com ", "ada@example.com"]);
    expect(draft).toBe("mailto:?bcc=ada%40example.com");
  });

  it("returns null when there are no addresses", () => {
    expect(buildTicketBuyerEmailDraft([])).toBeNull();
    expect(buildTicketBuyerEmailDraft(["", "  "])).toBeNull();
  });
});
