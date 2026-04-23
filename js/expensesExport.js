// expensesExport.js - VERSION TEST PROPRE

import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

/* ================================
   FORMAT DATE
================================ */
function formatDate(ts) {
  if (!ts) return "-";
  return ts.toDate().toLocaleString("fr-FR");
}

/* ================================
   EXPORT PDF
================================ */
export function exportToPDF(expenses = []) {

  if (!expenses.length) {
    alert("Aucune donnée à exporter");
    return;
  }

  const doc = new jsPDF();

  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Rapport des dépenses", 14, y);

  y += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  let total = 0;

  expenses.forEach((e, i) => {

    const line = `${i + 1}. ${e.label} | ${e.category} | ${e.amount} FC`;

    doc.text(line, 14, y);

    y += 7;
    total += e.amount;

    // pagination auto
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  });

  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text(`TOTAL : ${total} FC`, 14, y);

  doc.save("expenses.pdf");
}

/* ================================
   EXPORT EXCEL (CSV SIMPLE)
================================ */
export function exportToExcel(expenses = []) {

  if (!expenses.length) {
    alert("Aucune donnée à exporter");
    return;
  }

  const headers = ["Label", "Catégorie", "Montant", "Type", "Date"];

  const rows = expenses.map(e => [
    e.label,
    e.category,
    e.amount,
    e.type,
    formatDate(e.createdAt)
  ]);

  let csvContent = "data:text/csv;charset=utf-8,";

  csvContent += headers.join(",") + "\n";

  rows.forEach(row => {
    csvContent += row.join(",") + "\n";
  });

  const encodedUri = encodeURI(csvContent);

  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "expenses.csv");

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}