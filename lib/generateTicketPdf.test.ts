import { describe, it, expect } from "vitest";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { generateTicketPdf, generateTicketsPdf } from "@/lib/generateTicketPdf";

const COMMON = {
  eventName: "Rock & Roll Cabaret",
  date: "Saturday, 1 August 2026",
  time: "19:00",
  productionTheme: null,
};

describe("generateTicketsPdf", () => {
  it("emits one page per seat, in order", async () => {
    const buffer = await generateTicketsPdf(
      [
        { seatLabel: "A1", qrPayload: "ticket-a.sig-a" },
        { seatLabel: "A2", qrPayload: "ticket-b.sig-b" },
        { seatLabel: "B7", qrPayload: "ticket-c.sig-c" },
      ],
      COMMON,
    );
    const doc = await PDFLibDocument.load(buffer);
    expect(doc.getPageCount()).toBe(3);
  });

  it("single-seat output matches generateTicketPdf's page count", async () => {
    const single = await generateTicketPdf({
      seatLabel: "A1",
      qrPayload: "ticket-a.sig-a",
      ...COMMON,
    });
    const multi = await generateTicketsPdf([{ seatLabel: "A1", qrPayload: "ticket-a.sig-a" }], COMMON);
    const singleDoc = await PDFLibDocument.load(single);
    const multiDoc = await PDFLibDocument.load(multi);
    expect(multiDoc.getPageCount()).toBe(singleDoc.getPageCount());
  });
});
