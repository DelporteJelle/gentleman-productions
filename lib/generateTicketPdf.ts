import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import path from "path";
import type { ProductionTheme } from "@/types";

const W = 620;
const H = 290;

// Default production theme (fallback if none set)
const DEFAULT_THEME = {
  bg: "#0a0a0a",
  accent1: "#c9a84c",
  accent2: "#c9a84c",
  tagline: null,
};

export interface TicketSeat {
  seatLabel: string;
  qrPayload: string;
}

export interface TicketCommon {
  eventName: string;
  date: string;
  time: string;
  productionTheme: ProductionTheme | null;
}

/** Draws one ticket onto the document's *current* page. Caller owns paging. */
async function drawTicketPage(doc: PDFKit.PDFDocument, seat: TicketSeat, common: TicketCommon) {
  const pt = { ...DEFAULT_THEME, ...common.productionTheme };
  const { seatLabel, qrPayload } = seat;
  const { eventName, date, time } = common;

  // ── Background ───────────────────────────────────────────────
  doc.rect(0, 0, W, H).fill(pt.bg);

  // Subtle gradient-like overlay on right side using a lighter rectangle
  doc.rect(W / 2, 0, W / 2, H).fillOpacity(0.04).fill(pt.accent2).fillOpacity(1);

  // Left accent bar (production color)
  doc.rect(0, 0, 5, H).fill(pt.accent1);

  const logoPath = path.join(process.cwd(), "public", "logo.png");

  // ── QR Code ──────────────────────────────────────────────────
  const qrSize = 176;
  const qrX = W - qrSize - 44;
  const qrY = (H - qrSize) / 2;

  const qrBuffer = await QRCode.toBuffer(qrPayload, {
    width: qrSize,
    margin: 1,
    color: { dark: "#0a0a0a", light: "#f0f0f0" },
  });

  // QR background
  doc.roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 6).fill("#f0f0f0");
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  // ── Divider ──────────────────────────────────────────────────
  const divX = qrX - 36;
  doc.moveTo(divX, 28).lineTo(divX, H - 28).strokeColor("#2a2a2a").lineWidth(1).stroke();

  // ── Left content ─────────────────────────────────────────────
  const lPad = 32;
  let y = 32;

  // GP label (gold — always)
  doc.font("Helvetica").fontSize(7).fillColor("#c9a84c").text("GENTLEMAN PRODUCTIONS", lPad, y, { characterSpacing: 1.5 });
  y += 20;

  // Production name
  doc.font("Helvetica-Bold").fontSize(21).fillColor("#f5f5f5").text(eventName, lPad, y, { width: divX - lPad - 16 });
  y += doc.heightOfString(eventName, { width: divX - lPad - 16 }) + 6;

  // Tagline (production color)
  if (pt.tagline) {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(pt.accent1).text(pt.tagline, lPad, y, { width: divX - lPad - 16 });
    y += 20;
  }

  y += 4;

  // Date
  doc.font("Helvetica").fontSize(11).fillColor("#888888").text(date, lPad, y);
  y += 16;
  // Time
  doc.font("Helvetica").fontSize(11).fillColor("#888888").text(time, lPad, y);

  // ── Seat ─────────────────────────────────────────────────────
  const seatY = H - 70;
  doc.font("Helvetica").fontSize(8).fillColor("#888888").text("SEAT", lPad, seatY, { characterSpacing: 2 });
  doc.font("Helvetica-Bold").fontSize(38).fillColor(pt.accent2).text(seatLabel, lPad, seatY + 12);

  // ── Bottom strip ─────────────────────────────────────────────
  doc.rect(0, H - 26, W, 26).fill("#0d0d0d");
  doc.font("Helvetica").fontSize(7.5).fillColor("#555555").text(
    "Show this QR code at the door  ·  One scan per person  ·  Not transferable",
    0, H - 17, { width: W - 40, align: "center" }
  );
  // Logo in bottom-right corner of strip
  try {
    doc.image(logoPath, W - 30, H - 24, { height: 22 });
  } catch (_) { /* skip if not found */ }
}

/** Single-ticket PDF. Used by sendTicketEmail — one attachment per seat. */
export async function generateTicketPdf(seat: TicketSeat & TicketCommon): Promise<Buffer> {
  return generateTicketsPdf([seat], seat);
}

/** Multi-page PDF, one ticket per page, in the order given. */
export async function generateTicketsPdf(seats: TicketSeat[], common: TicketCommon): Promise<Buffer> {
  const title = seats.length === 1 ? `Ticket – ${seats[0].seatLabel}` : `Tickets – ${common.eventName}`;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: [W, H],
      margin: 0,
      info: { Title: title, Author: "Gentleman Productions" },
    });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    (async () => {
      for (let i = 0; i < seats.length; i++) {
        if (i > 0) doc.addPage({ size: [W, H], margin: 0 });
        await drawTicketPage(doc, seats[i], common);
      }
      doc.end();
    })().catch(reject);
  });
}
