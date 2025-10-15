import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function makeSealedPdf({ hash, title, notes, logoPath, productId, receipt }) {
  const doc = new PDFDocument({ size: "A4", margins:{ top:56, left:56, right:56, bottom:56 } });
  const fontPath = path.join(__dirname, "fonts", "DejaVuSans.ttf");
  if (fs.existsSync(fontPath)) doc.registerFont("DejaVuSans", fontPath);
  const font = fs.existsSync(fontPath) ? "DejaVuSans" : "Helvetica";

  if (logoPath && fs.existsSync(logoPath)) {
    const { width } = doc.page;
    doc.image(logoPath, (width-140)/2, 24, { width: 140 });
  }

  if (logoPath && fs.existsSync(logoPath)) {
    const { width, height } = doc.page;
    const wmW = 360, wmX = (width - wmW)/2, wmY = (height - wmW)/2;
    doc.save().opacity(0.08).image(logoPath, wmX, wmY, { width: wmW }).restore();
  }

  doc.moveDown(3);
  doc.font(font).fontSize(18).text(title || "Sealed Verification", { align: "center" }).moveDown(1);
  doc.fontSize(10).text("SHA-512:", { continued: true }).font(font).text(hash);

  const trunc = s => (s ? s.slice(0,16) + "…" : "");
  if (receipt?.issuedAt) doc.text(`Issued: ${receipt.issuedAt}`);
  if (receipt?.txid) doc.text(`Anchor: ${receipt.chain || "eth"} / ${trunc(receipt.txid)}`);
  doc.text(`Product: ${productId || "VO-Web32"}`).moveDown(0.5);

  if (notes) { doc.fontSize(11).text("Notes:", { underline:true }); doc.fontSize(10).text(notes); }

  const qrPayload = { verum:true, hash, productId, receipt: receipt ? { chain: receipt.chain, txid: receipt.txid, issuedAt: receipt.issuedAt } : null };
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));
  const qrBuf = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const { width:w, height:h } = doc.page;
  const blockW=240, blockH=110, x=w-blockW-56, y=h-blockH-56;
  doc.roundedRect(x, y, blockW, blockH, 12).stroke();
  doc.image(qrBuf, x+8, y+8, { width: 90 });
  doc.font(font).fontSize(10)
     .text("✔ Patent Pending Verum Omnis", x+110, y+14)
     .text(`Hash: ${hash.slice(0,16)}…`, x+110, y+30)
     .text("This document is sealed and tamper-evident.", x+110, y+62);

  doc.end();
  return doc;
}
