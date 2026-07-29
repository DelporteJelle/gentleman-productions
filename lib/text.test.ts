import { describe, it, expect } from "vitest";
import { escapeHtml } from "@/lib/text";

describe("escapeHtml", () => {
  it("escapes every character that can break out of HTML text", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(escapeHtml(`Tom & "Jerry" O'Brien`)).toBe(
      "Tom &amp; &quot;Jerry&quot; O&#39;Brien",
    );
  });

  it("escapes ampersands first so entities are not double-broken", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Ada Lovelace")).toBe("Ada Lovelace");
    expect(escapeHtml("")).toBe("");
  });
});
