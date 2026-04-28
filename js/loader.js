import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import html2canvas from "https://esm.sh/html2canvas@1.4.1";

const el = (id) => document.getElementById(id);
const n = (v) => Number(v) || 0;

/* =========================
   DEBUG
========================= */
let debugTimer;

function debug(msg) {
  const box = el("debug");
  if (!box) return;

  box.textContent = msg;

  clearTimeout(debugTimer);
  debugTimer = setTimeout(() => {
    box.textContent = "";
  }, 60000);
}

/* =========================
   STATE
========================= */
let ready = false;

/* =========================
   AUTH
========================= */
const auth = getAuth();

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  debug("🔄 Chargement...");
  await load();
});

/* =========================
   LOAD
========================= */
async function load() {
  try {

    const [
  salesSnap,
  expSnap,
  stockSnap,
  prodSnap,
  invSnap,
  debtSnap,
  lossSnap
] = await Promise.all([
  getDocs(collection(db, "sales")),
  getDocs(collection(db, "expenses")),
  getDocs(collection(db, "stock_movements")),
  getDocs(collection(db, "products")),
  getDocs(collection(db, "investments")),
  getDocs(collection(db, "debts")),
  getDocs(collection(db, "losses"))
]);

const investments = invSnap.docs.map(d => d.data() || {});

    const sales = salesSnap.docs.map(d => d.data() || {});
    const expenses = expSnap.docs.map(d => d.data() || {});
    const stock = stockSnap.docs.map(d => d.data() || {});
    const products = prodSnap.docs.map(d => d.data() || {});
    const debts = debtSnap.docs.map(d => d.data() || {});
    const losses = lossSnap.docs.map(d => d.data() || {});

    render(sales, expenses, stock, products, investments, debts, losses);

    ready = true;
    el("pdfBtn").disabled = false;

    debug("✅ Dashboard prêt");

  } catch (e) {
    debug("❌ " + e.message);
  }
}

/* =========================
   RENDER
========================= */
function render(sales, expenses, stock, products, investments, debts, losses) {

    const stockValue = products.reduce((total, p) => {

  const price = n(p.price_buy);       // ✔ coût réel stock
  const stock = n(p.stock_current);   // ✔ stock réel

  return total + (price * stock);

}, 0);

const totalSales = sales.reduce((a, s) =>
  a + n(s.total_amount || s.amount || s.amount_total)
, 0);

const totalDebts = debts.reduce((a, d) =>
  a + n(d.amount_remaining),
0);

const totalLosses = losses.reduce((a, l) =>
  a + n(l.estimated_value),
0);

const totalExpenses = expenses.reduce((a, e) =>
  a + n(e.amount)
, 0);

// 🔥 split propre investments
const totalReinvested = investments
  .filter(i => n(i.reinvested) > 0)
  .reduce((a, i) => a + n(i.reinvested), 0);

const totalExternal = investments
  .filter(i => n(i.external) > 0)
  .reduce((a, i) => a + n(i.external), 0);

// 🔥 PROFIT NET PROPRE
const netProfit = totalSales - totalExpenses - totalReinvested - totalLosses;

// 🔥 cash flow
const cashFlow = totalSales - totalExpenses - totalDebts;

// 🔥 profit idéal (sans dépenses ni reinvest)
const idealProfit = sales.reduce((a, s) =>
  a + n(s.total_profit || s.profit)
, 0);

const reinvestRate = totalSales > 0
  ? (totalReinvested / totalSales) * 100
  : 0;

  const stockIn = stock.filter(s => s.type === "IN")
    .reduce((a, s) => a + n(s.quantity), 0);

  const stockOut = stock.filter(s => s.type === "OUT")
    .reduce((a, s) => a + n(s.quantity), 0);

  const stockTotal = stockIn - stockOut;

  
  el("stockValue").textContent = stockValue + " FC";
  el("sales").textContent = totalSales + " FC";
  el("profit").textContent = netProfit + " FC"; // ✔ vrai profit
  el("expenses").textContent = totalExpenses + " FC";
  el("sold").textContent = sales.length;
  el("stockTotal").textContent = stockTotal;
  el("products").textContent = products.length;
  el("cashFlow").textContent = cashFlow + " FC";
el("idealProfit").textContent = idealProfit + " FC";
el("externalValue")?.textContent = totalExternal + " FC";
el("reinvestRate").textContent = reinvestRate.toFixed(1) + "%";

el("debts").textContent = totalDebts + " FC";
el("losses").textContent = totalLosses + " FC";

  debug("✅ OK");
}

/* =========================
   PDF (CLEAN MODULE ONLY)
========================= */
el("pdfBtn").disabled = true;

function generateId() {
  return "dev" + Date.now().toString(36).toUpperCase();
}

function formatDate() {
  return new Date().toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

el("pdfBtn").addEventListener("click", async () => {

  if (!ready) {
    debug("⏳ Chargement...");
    return;
  }

  try {

    const grid = document.querySelector(".grid");

    // 🔥 SAUVEGARDE styles actuels
    const oldWidth = grid.style.width;
    const oldMaxWidth = grid.style.maxWidth;

    // 🔥 FIX largeur (clé du problème)
    grid.style.width = "800px";
    grid.style.maxWidth = "800px";

    const canvas = await html2canvas(grid, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff"
    });

    // 🔁 RESTORE (aucune casse UI)
    grid.style.width = oldWidth;
    grid.style.maxWidth = oldMaxWidth;

    const img = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");

    const id = generateId();
    const date = formatDate();

    /* HEADER */
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Es-Shop Invoice Report", 14, 18);

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`ID: ${id}`, 14, 26);
    pdf.text(`Date: ${date}`, 14, 32);

    /* LOGO */
    pdf.setDrawColor(200);
    pdf.rect(160, 10, 35, 20);
    pdf.setFontSize(8);
    pdf.text("ES-SHOP", 172, 22);

    /* IMAGE GRID */
    const w = 190;
    const h = (canvas.height * w) / canvas.width;

    pdf.addImage(img, "PNG", 10, 40, w, h);

    /* FOOTER */
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text("Generated by Es-Shop System", 14, 285);

    pdf.save(`es-shop-${id}.pdf`);

    debug("📄 PDF généré");

  } catch (e) {
    debug("❌ PDF: " + e.message);
  }

});
