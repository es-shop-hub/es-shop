import {
  fetchAllData,
  getTodayStats,
  getWeekStats,
  getMonthStats,
  getComparisons,
  getYearStats,
  buildWeeklyChart,
  buildMonthlyChart,
  buildYearlyChart,
  isEmpty
} from './stats.js';

import { guardAdmin, waitForAdminAccess } from './stats.js';

import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';


/* ================================
   🔒 SECURITY GATE (UI BLOCK)
================================ */
async function initSecurity() {
  try {
    await waitForAdminAccess();
  } catch (err) {
    document.body.innerHTML = `
      <div style="padding:20px;font-family:Arial;">
        <h2>⛔ Accès refusé</h2>
        <p>Admin uniquement</p>
      </div>
    `;
    throw new Error("ACCESS DENIED");
  }
}


/* ================================
   🔥 RENDER HELPERS
================================ */
function el(id) {
  return document.getElementById(id);
}

function box(label, value, type = "") {
  const div = document.createElement("div");
  div.className = type ? `kpi ${type}` : "kpi";
  div.innerHTML = `<strong>${label}</strong><br>${value}`;
  return div;
}


/* ================================
   🔥 MAIN INIT
================================ */
async function initDashboard() {

  await initSecurity();

  const data = await fetchAllData();

  if (isEmpty(getTodayStats(data))) {
    console.warn("EMPTY DATA SYSTEM");
  }

  /* ================================
     🔥 TODAY KPI
  ================================= */
  const today = getTodayStats(data);

  const kpiToday = el("kpi-today");
  kpiToday.innerHTML = "";
  kpiToday.append(
    box("Ventes", today.total_sales),
    box("Profit brut", today.total_profit, "good"),
    box("Dépenses", today.total_expenses, "danger"),
    box("Net", today.net, today.net < 0 ? "danger" : "good"),
    box("Cash réel", today.real_cash),
    box("Produits", today.products_sold)
  );


  /* ================================
     ⚖️ COMPARAISONS
  ================================= */
  const comp = getComparisons(data);
  const cmp = el("comparisons");
  cmp.innerHTML = "";

  cmp.append(
    box("Ventes vs hier", `${comp.today.total_sales} / ${comp.yesterday.total_sales}`),
    box("Profit vs hier", `${comp.today.total_profit} / ${comp.yesterday.total_profit}`),
    box("Net vs hier", `${comp.today.net} / ${comp.yesterday.net}`)
  );


  /* ================================
     ⚡ WEEK
  ================================= */
  const week = getWeekStats(data);
  const weekEl = el("week-stats");
  weekEl.innerHTML = "";
  weekEl.append(
    box("Ventes", week.total_sales),
    box("Profit", week.total_profit),
    box("Net", week.net)
  );


  /* ================================
     ⚡ MONTH (5 semaines)
  ================================= */
  const month = getMonthStats(data);
  const monthEl = el("month-stats");
  monthEl.innerHTML = "";
  monthEl.append(
    box("Ventes", month.total_sales),
    box("Profit", month.total_profit),
    box("Net", month.net)
  );


  /* ================================
     📆 YEAR INIT
  ================================= */
  const yearSelect = el("yearSelect");
  const years = [...new Set(data.sales.map(s =>
    new Date(s.createdAt?.toDate?.() || s.createdAt).getFullYear()
  ))];

  years.sort((a,b)=>b-a);

  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");

  async function renderYear(year) {

    const yData = getYearStats(data, Number(year));

    /* SUMMARY */
    const ys = el("year-summary");
    ys.innerHTML = "";
    ys.append(
      box("Ventes annuelles", yData.totals.total_sales),
      box("Profit", yData.totals.total_profit),
      box("Dépenses", yData.totals.total_expenses),
      box("Net", yData.totals.net, yData.totals.net < 0 ? "danger" : "good"),
      box("Cash réel", yData.totals.real_cash)
    );

    /* PROJECTION */
    const proj = el("projection");
    proj.innerHTML = "";
    proj.append(
      box("Profit réel", yData.totals.total_profit),
      box("Sans dépenses", yData.totals.ideal_profit),
      box("Perte due dépenses", yData.totals.total_expenses, "danger")
    );

    /* DEBTS */
    const debt = el("debts-stats");
    debt.innerHTML = "";
    debt.append(
      box("Dettes restantes", yData.totals.debts_remaining, "danger"),
      box("Cash réel", yData.totals.real_cash)
    );

    /* ================================
       📊 CHARTS
    ================================= */
    const weekly = buildWeeklyChart(data);
    const monthly = buildMonthlyChart(data);
    const yearly = buildYearlyChart(yData);

    new Chart(el("weeklyChart"), {
      type: "line",
      data: {
        labels: weekly.labels,
        datasets: [{ data: weekly.values }]
      }
    });

    new Chart(el("monthlyChart"), {
      type: "bar",
      data: {
        labels: monthly.labels,
        datasets: [{ data: monthly.values }]
      }
    });

    new Chart(el("yearlyChart"), {
      type: "line",
      data: {
        labels: yearly.labels,
        datasets: [{ data: yearly.values }]
      }
    });
  }

  renderYear(years[0] || new Date().getFullYear());

  yearSelect.onchange = (e) => renderYear(e.target.value);
}


/* ================================
   🚀 BOOT
================================ */


export async function initStatsApp() {
  try {
    console.log("UI LOADED");
    await initDashboard();
  } catch (e) {
    alert("Erreur UI: " + e.message);
    console.error(e);
  }
}

// AUTO START
initStatsApp();
