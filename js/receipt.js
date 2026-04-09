import { jsPDF } from "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

// --- CONFIG ---
const SHOP_NAME = "NOM DE LA BOUTIQUE";
const SHOP_ADDRESS = "Adresse : XXXXX";
const SHOP_PHONE = "Tel : XXXXX";
const logoUrl = "https://example.com/logo.png";

const MAX_ITEMS_PER_RECEIPT = 18;

// --- LOAD LOGO ---
async function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      res(canvas.toDataURL("image/png"));
    };
    img.onerror = rej;
    img.src = url;
  });
}

// --- FORMAT DATE ---
function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// --- DRAW ONE RECEIPT ---
function drawReceipt(doc, data, x, y, width, height, logo) {
  let cursorY = y + 20;

  // Border
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, height);

  // Logo + Name
  if (logo) doc.addImage(logo, "PNG", x + 10, cursorY, 40, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(SHOP_NAME, x + width / 2, cursorY + 10, { align: "center" });

  cursorY += 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(SHOP_ADDRESS, x + width / 2, cursorY, { align: "center" });
  cursorY += 12;
  doc.text(SHOP_PHONE, x + width / 2, cursorY, { align: "center" });

  cursorY += 15;

  doc.line(x + 10, cursorY, x + width - 10, cursorY);
  cursorY += 12;

  // Receipt info
  doc.text(`Reçu #: ${data.saleId}`, x + 10, cursorY);
  doc.text(`Date: ${formatDate(data.date)}`, x + width - 10, cursorY, { align: "right" });

  cursorY += 10;
  doc.line(x + 10, cursorY, x + width - 10, cursorY);
  cursorY += 12;

  // Table Header
  doc.setFont("helvetica", "bold");
  doc.text("Produit", x + 10, cursorY);
  doc.text("Qté", x + width - 110, cursorY, { align: "right" });
  doc.text("Prix", x + width - 70, cursorY, { align: "right" });
  doc.text("Total", x + width - 10, cursorY, { align: "right" });

  cursorY += 10;
  doc.setFont("helvetica", "normal");

  // Items
  data.items.forEach(item => {
    const total = item.qty * item.price;

    doc.text(item.name.substring(0, 18), x + 10, cursorY);
    doc.text(String(item.qty), x + width - 110, cursorY, { align: "right" });
    doc.text(item.price.toFixed(2), x + width - 70, cursorY, { align: "right" });
    doc.text(total.toFixed(2), x + width - 10, cursorY, { align: "right" });

    cursorY += 10;
  });

  cursorY += 5;
  doc.line(x + 10, cursorY, x + width - 10, cursorY);

  cursorY += 12;

  // Total
  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL: ${data.total.toFixed(2)}$`, x + width - 10, cursorY, { align: "right" });

  cursorY += 20;

  doc.setFont("helvetica", "normal");
  doc.text("Merci pour votre achat", x + width / 2, cursorY, { align: "center" });

  cursorY += 20;

  doc.text("Signature vendeur :", x + 10, cursorY);
  cursorY += 10;
  doc.line(x + 10, cursorY, x + 120, cursorY);
}

// --- MAIN FUNCTION ---
window.generateReceipt = async function(data) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const receiptWidth = pageWidth - 40;
  const receiptHeight = (pageHeight - 60) / 2;

  let logo = null;
  try {
    logo = await loadImage(logoUrl);
  } catch {}

  // --- SPLIT ITEMS ---
  const chunks = [];
  for (let i = 0; i < data.items.length; i += MAX_ITEMS_PER_RECEIPT) {
    chunks.push(data.items.slice(i, i + MAX_ITEMS_PER_RECEIPT));
  }

  // --- GENERATE ---
  chunks.forEach((itemsChunk, index) => {

    if (index !== 0 && index % 2 === 0) doc.addPage();

    const yOffset = (index % 2 === 0) ? 20 : receiptHeight + 30;

    const receiptData = {
      ...data,
      items: itemsChunk,
      total: itemsChunk.reduce((a,b)=>a + b.qty * b.price, 0)
    };

    // double receipt (copie client + boutique)
    drawReceipt(doc, receiptData, 20, yOffset, receiptWidth, receiptHeight, logo);
    drawReceipt(doc, receiptData, 20, yOffset, receiptWidth, receiptHeight, logo);
  });

  doc.save(`recu_${data.saleId}.pdf`);
};
