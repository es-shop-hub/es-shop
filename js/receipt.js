// receipt.js
import { jsPDF } from "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

// URL logo fixe
const logoUrl = "https://example.com/logo.png"; // 🔥 remplace par ton logo IA

// --- Helper pour charger image en DataURL ---
function loadImageAsDataURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// --- Génère un reçu ---
export async function generateReceipt(saleData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const receiptHeight = (pageHeight - margin * 2) / 2; // 2 reçus verticalement × 2 horizontale = 4

  const receiptsPerPage = 4; // 2x2
  let count = 0;

  for (let r = 0; r < receiptsPerPage; r++) {
    const row = Math.floor(r / 2);
    const col = r % 2;
    const xOffset = margin + col * (pageWidth / 2);
    let yOffset = margin + row * receiptHeight;

    if (!saleData.items[r]) break; // pas de données pour ce reçu

    // --- Bordure du reçu ---
    doc.setLineWidth(0.5);
    doc.rect(xOffset, yOffset, pageWidth / 2 - margin, receiptHeight - margin);

    let y = yOffset + 30;

    // --- Logo ---
    try {
      const img = await loadImageAsDataURL(logoUrl);
      doc.addImage(img, 'PNG', xOffset + 10, y, 80, 40);
    } catch (e) {
      console.warn("Logo non chargé :", e);
    }

    y += 50;

    // --- Titre ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("REÇU DE VENTE", xOffset + (pageWidth / 4 - margin / 2), y, { align: "center" });
    y += 25;

    // --- Client & Date ---
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Client: ${saleData.clientName || "__________"}`, xOffset + 10, y);
    y += 15;
    const saleDate = saleData.createdAt.toDate ? saleData.createdAt.toDate() : new Date();
    const dayStr = saleDate.toLocaleDateString("fr-FR", { weekday: 'long' });
    doc.text(`Date: ${saleDate.toLocaleDateString()} (${dayStr})`, xOffset + 10, y);
    y += 20;

    // --- Table des produits ---
    const headers = ["Produit", "Variante", "Qté", "Prix U", "Total"];
    const colWidths = [80, 50, 30, 40, 40];
    let x = xOffset + 10;

    doc.setFont("helvetica", "bold");
    headers.forEach((h, i) => {
      doc.text(h, x, y);
      x += colWidths[i];
    });

    y += 12;
    doc.setFont("helvetica", "normal");

    saleData.items.forEach((item, idx) => {
      x = xOffset + 10;
      if (y > yOffset + receiptHeight - 60) return; // éviter dépassement

      doc.text(item.name, x, y);
      x += colWidths[0];
      doc.text(item.variant || "-", x, y);
      x += colWidths[1];
      doc.text(String(item.qty), x, y, { align: "right" });
      x += colWidths[2];
      doc.text(item.price.toFixed(2) + "$", x, y, { align: "right" });
      x += colWidths[3];
      doc.text((item.qty * item.price).toFixed(2) + "$", x, y, { align: "right" });
      y += 12;
    });

    y += 15;
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL : ${saleData.total_amount.toFixed(2)}$`, xOffset + 10, y);
    y += 25;

    doc.setFont("helvetica", "normal");
    doc.text("Signature : _________________________", xOffset + 10, y);
    y += 15;

    if (saleData.notes) {
      doc.text(`Notes: ${saleData.notes}`, xOffset + 10, y);
    }

    count++;
  }

  doc.save(`recu_${saleDate.getTime()}.pdf`);
}

// --- Écoute événement ---
document.addEventListener('sale-created', e => generateReceipt(e.detail));