// stats.js ULTRA-PRO v5 avec Chart.js
import { 
  db, collection, getDocs, addDoc, doc, getDoc,
  query, where, orderBy,
  enableIndexedDbPersistence, Timestamp 
} from './firebase.js';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import jsPDF from 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js';

// --- OFFLINE ---
enableIndexedDbPersistence(db).catch(err => console.warn("Offline non dispo:", err));

// --- DOM ---
const dailyContainer = document.getElementById('daily-totals');
const weeklyContainer = document.getElementById('weekly-totals');
const monthlyContainer = document.getElementById('monthly-totals');
const yearlyContainer = document.getElementById('yearly-total');

const exportWeekBtn = document.getElementById('export-week');
const exportMonthBtn = document.getElementById('export-month');
const exportYearBtn = document.getElementById('export-year');

const weeklyChartCanvas = document.getElementById('weekly-chart');
const monthlyChartCanvas = document.getElementById('monthly-chart');
const yearlyChartCanvas = document.getElementById('yearly-chart');

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- CHECK USER ---
async function checkUser(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) throw new Error("Utilisateur inconnu");
  const data = userDoc.data();
  if (!data.isActive || (data.role !== "admin" && data.role !== "seller")) throw new Error("Accès refusé");
  return data;
}

// --- LOG ---
async function logAction(action, targetId, details = {}) {
  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action,
    targetId,
    details,
    createdAt: Timestamp.now()
  });
}

// --- LOAD SALES ---
// On charge les ventes "active" et leurs items séparément
async function loadSales({ year = null } = {}) {
  const salesRef = collection(db, "sales");
  let q;

  if (year) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    q = query(
      salesRef,
      where("status", "==", "active"),
      where("createdAt", ">=", start),
      where("createdAt", "<", end),
      orderBy("createdAt", "asc")
    );
  } else {
    q = query(salesRef, where("status", "==", "active"), orderBy("createdAt", "asc"));
  }

  const snap = await getDocs(q);
  const sales = [];

  for (const docSnap of snap.docs) {
    const sale = { id: docSnap.id, ...docSnap.data(), items: [] };
    // Charge les items de la vente
    const itemsSnap = await getDocs(query(collection(db, "sale_items"), where("saleId", "==", sale.id)));
    sale.items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    sales.push(sale);
  }

  return sales;
}

// --- SAFE DATE ---
function getDate(sale) {
  return sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt || Date.now());
}

// --- CALCULS ---
function calculateWeekly(sales) {
  const now = new Date();
  const daily = Array(7).fill(0);
  const dailyProfit = Array(7).fill(0);

  sales.forEach(sale => {
    const d = getDate(sale);
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      const idx = 6 - diffDays;
      daily[idx] += sale.total_amount || 0;
      dailyProfit[idx] += sale.total_profit || 0;
    }
  });

  return { daily, dailyProfit };
}

function calculateMonthly(sales) {
  const now = new Date();
  const weeks = Array(5).fill(0);
  const weeksProfit = Array(5).fill(0);

  sales.forEach(sale => {
    const d = getDate(sale);
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    const weekNum = Math.floor(diffDays / 7);
    if (weekNum < 5) {
      const idx = 4 - weekNum;
      weeks[idx] += sale.total_amount || 0;
      weeksProfit[idx] += sale.total_profit || 0;
    }
  });

  return { weeks, weeksProfit };
}

function calculateYearly(sales, year = null) {
  const months = Array(12).fill(0);
  const monthsProfit = Array(12).fill(0);
  const currentYear = year || new Date().getFullYear();

  sales.forEach(sale => {
    const d = getDate(sale);
    if (d.getFullYear() === currentYear) {
      const idx = d.getMonth();
      months[idx] += sale.total_amount || 0;
      monthsProfit[idx] += sale.total_profit || 0;
    }
  });

  const totalAmount = months.reduce((a, b) => a + b, 0);
  const totalProfit = monthsProfit.reduce((a, b) => a + b, 0);

  return { months, monthsProfit, totalAmount, totalProfit };
}

function calculateQuarterly(monthlyData) {
  const quarters = [0, 0, 0, 0];
  const quartersProfit = [0, 0, 0, 0];

  monthlyData.months.forEach((amt, i) => {
    const q = Math.floor(i / 3);
    quarters[q] += amt;
    quartersProfit[q] += monthlyData.monthsProfit[i];
  });

  return { quarters, quartersProfit };
}

// --- FORMAT ---
function fc(v) { return `${v.toFixed(0)} FC`; }

// --- RENDER DOM ---
function renderWeekly(data) {
  dailyContainer.innerHTML = data.daily.map((v, i) =>
    `<div>J-${6 - i}: Vente ${fc(v)} / Profit ${fc(data.dailyProfit[i])}</div>`).join('');
  renderChart(weeklyChartCanvas, 'Hebdomadaire', Array.from({ length: 7 }, (_, i) => `J-${6 - i}`), data.daily, data.dailyProfit);
}

function renderMonthly(data) {
  weeklyContainer.innerHTML = data.weeks.map((v, i) =>
    `<div>S-${4 - i}: Vente ${fc(v)} / Profit ${fc(data.weeksProfit[i])}</div>`).join('');
  renderChart(monthlyChartCanvas, 'Mensuelle', Array.from({ length: 5 }, (_, i) => `S-${4 - i}`), data.weeks, data.weeksProfit);
}

function renderYearly(data) {
  yearlyContainer.innerHTML = data.months.map((v, i) =>
    `<div>Mois ${i + 1}: Vente ${fc(v)} / Profit ${fc(data.monthsProfit[i])}</div>`).join('');
  yearlyContainer.innerHTML += `<div style="margin-top:8px;font-weight:bold;">Total annuel: Vente ${fc(data.totalAmount)} / Profit ${fc(data.totalProfit)}</div>`;
  const quarterData = calculateQuarterly(data);
  yearlyContainer.innerHTML += `<div style="margin-top:4px;font-weight:bold;">
    Q1: ${fc(quarterData.quarters[0])}/${fc(quarterData.quartersProfit[0])} |
    Q2: ${fc(quarterData.quarters[1])}/${fc(quarterData.quartersProfit[1])} |
    Q3: ${fc(quarterData.quarters[2])}/${fc(quarterData.quartersProfit[2])} |
    Q4: ${fc(quarterData.quarters[3])}/${fc(quarterData.quartersProfit[3])}
  </div>`;
  renderChart(yearlyChartCanvas, 'Annuel', Array.from({ length: 12 }, (_, i) => `Mois ${i + 1}`), data.months, data.monthsProfit);
}

// --- CHART.JS ---
let chartInstances = {};
function renderChart(canvas, title, labels, amounts, profits) {
  if (chartInstances[canvas.id]) chartInstances[canvas.id].destroy();
  chartInstances[canvas.id] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Vente', data: amounts, backgroundColor: '#4caf50' },
        { label: 'Profit', data: profits, backgroundColor: '#ff9800' }
      ]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: title } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// --- EXPORT PDF ---
function exportPDF(title, container) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text(title, 14, 20);
  let y = 30;
  container.querySelectorAll('div').forEach(div => { doc.setFontSize(12); doc.text(`- ${div.innerText}`, 14, y); y += 6; });
  doc.save(`${title.replace(/\s/g, '_')}.pdf`);
}

// --- EVENTS ---
exportWeekBtn.addEventListener('click', () => exportPDF('Stats Hebdomadaire', dailyContainer));
exportMonthBtn.addEventListener('click', () => exportPDF('Stats Mensuelle', weeklyContainer));
exportYearBtn.addEventListener('click', () => exportPDF('Stats Annuelle', yearlyContainer));

// --- INIT ---
onAuthStateChanged(auth, async user => {
  if (!user) { alert("Non connecté"); window.location.replace("login.html"); return; }
  currentUserId = user.uid;
  try {
    await checkUser(currentUserId);
    const sales = await loadSales();
    renderWeekly(calculateWeekly(sales));
    renderMonthly(calculateMonthly(sales));
    renderYearly(calculateYearly(sales));
  } catch (e) { alert(e.message); console.error(e); }
});
