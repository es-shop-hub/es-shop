import {
  db, collection, getDocs
} from './firebase.js';
import { getFirestore, enableIndexedDbPersistence } 
from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();
enableIndexedDbPersistence(db);
/* ================================
   🔐 ACCESS CONTROL (ADMIN ONLY)
================================ */
let isAllowed = false;

export function waitForAdminAccess() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        reject("NO_USER");
        return;
      }

      try {
        const snap = await getDocs(collection(db, "users"));
        const me = snap.docs.find(d => d.id === user.uid);

        if (!me) {
          reject("USER_NOT_FOUND");
          return;
        }

        const role = me.data().role;

        if (role !== "admin") {
          reject("NOT_ADMIN");
          return;
        }

        isAllowed = true;
        resolve(true);

      } catch (err) {
        reject("ACCESS_ERROR");
      }
    });
  });
}

/* ================================
   🔒 GUARD WRAPPER (OPTIONNEL MAIS PRO)
================================ */
export function guardAdmin() {
  if (!isAllowed) {
    throw new Error("ACCESS DENIED: ADMIN ONLY");
  }
}
/* ================================
   🔥 HELPERS TEMPS
================================ */
const now = new Date();

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfWeek = d => {
  const date = new Date(d);
  const day = date.getDay() || 7;
  if (day !== 1) date.setHours(-24 * (day - 1));
  return startOfDay(date);
};
const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfYear = y => new Date(y, 0, 1);
const endOfYear = y => new Date(y, 11, 31, 23, 59, 59);

const toDate = (t) => t?.toDate ? t.toDate() : new Date(t);


/* ================================
   🔥 FETCH DATA
================================ */
async function getAll(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchAllData() {
  const [sales, saleItems, expenses, debts] = await Promise.all([
    getAll('sales'),
    getAll('sale_items'),
    getAll('expenses'),
    getAll('debts')
  ]);

  return { sales, saleItems, expenses, debts };
}


/* ================================
   🔥 CORE FILTER
================================ */
function filterByDate(data, start, end) {
  return data.filter(d => {
    const date = toDate(d.createdAt);
    return date >= start && date <= end;
  });
}


/* ================================
   🔥 CALCULS PRINCIPAUX
================================ */
function computeStats({ sales, saleItems, expenses, debts }) {
  const total_sales = sales.reduce((a, s) => a + (s.total_amount || 0), 0);
  const total_profit = sales.reduce((a, s) => a + (s.total_profit || 0), 0);
  const total_expenses = expenses.reduce((a, e) => a + (e.amount || 0), 0);
  const debts_remaining = debts.reduce((a, d) => a + (d.amount_remaining || 0), 0);

  const nb_sales = sales.length;
  const products_sold = saleItems.reduce((a, i) => a + (i.quantity || 0), 0);

  const real_cash = total_sales - debts_remaining;
  const net = total_profit - total_expenses;
  const ideal_profit = total_profit;

  const panier_moyen = nb_sales ? total_sales / nb_sales : 0;

  return {
    total_sales,
    total_profit,
    total_expenses,
    debts_remaining,
    real_cash,
    net,
    ideal_profit,
    nb_sales,
    products_sold,
    panier_moyen
  };
}


/* ================================
   🔥 TEMPS RÉEL
================================ */
export function getTodayStats(data) {
  const start = startOfDay(now);
  const end = now;

  return computeStats({
    sales: filterByDate(data.sales, start, end),
    saleItems: filterByDate(data.saleItems, start, end),
    expenses: filterByDate(data.expenses, start, end),
    debts: filterByDate(data.debts, start, end)
  });
}

export function getWeekStats(data) {
  const start = new Date();
  start.setDate(now.getDate() - 7);

  return computeStats({
    sales: filterByDate(data.sales, start, now),
    saleItems: filterByDate(data.saleItems, start, now),
    expenses: filterByDate(data.expenses, start, now),
    debts: filterByDate(data.debts, start, now)
  });
}

export function getMonthStats(data) {
  const start = new Date();
  start.setDate(now.getDate() - 35);

  return computeStats({
    sales: filterByDate(data.sales, start, now),
    saleItems: filterByDate(data.saleItems, start, now),
    expenses: filterByDate(data.expenses, start, now),
    debts: filterByDate(data.debts, start, now)
  });
}


/* ================================
   🔥 COMPARAISONS
================================ */
export function getComparisons(data) {
  const today = getTodayStats(data);

  const yesterdayStart = new Date();
  yesterdayStart.setDate(now.getDate() - 1);
  const yesterdayEnd = startOfDay(now);

  const yesterday = computeStats({
    sales: filterByDate(data.sales, yesterdayStart, yesterdayEnd),
    saleItems: filterByDate(data.saleItems, yesterdayStart, yesterdayEnd),
    expenses: filterByDate(data.expenses, yesterdayStart, yesterdayEnd),
    debts: filterByDate(data.debts, yesterdayStart, yesterdayEnd)
  });

  return { today, yesterday };
}


/* ================================
   🔥 ANALYSE ANNUELLE
================================ */
export function getYearStats(data, year) {
  const start = startOfYear(year);
  const end = endOfYear(year);

  const sales = filterByDate(data.sales, start, end);
  const expenses = filterByDate(data.expenses, start, end);
  const debts = filterByDate(data.debts, start, end);

  const monthly = Array(12).fill(0).map(() => ({
    sales: 0,
    profit: 0,
    expenses: 0,
    net: 0
  }));

  sales.forEach(s => {
    const d = toDate(s.createdAt);
    const m = d.getMonth();
    monthly[m].sales += s.total_amount || 0;
    monthly[m].profit += s.total_profit || 0;
  });

  expenses.forEach(e => {
    const d = toDate(e.createdAt);
    const m = d.getMonth();
    monthly[m].expenses += e.amount || 0;
  });

  monthly.forEach(m => {
    m.net = m.profit - m.expenses;
  });

  const totals = computeStats({
    sales,
    saleItems: data.saleItems,
    expenses,
    debts
  });

  return { monthly, totals };
}


/* ================================
   🔥 GRAPHIQUES
================================ */
export function buildWeeklyChart(data) {
  const labels = [];
  const values = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);

    const start = startOfDay(d);
    const end = new Date(d);
    end.setHours(23,59,59);

    const stats = computeStats({
      sales: filterByDate(data.sales, start, end),
      saleItems: [],
      expenses: filterByDate(data.expenses, start, end),
      debts: []
    });

    labels.push(d.toLocaleDateString());
    values.push(stats.net);
  }

  return { labels, values };
}

export function buildMonthlyChart(data) {
  const labels = [];
  const values = [];

  for (let i = 4; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - (i * 7));

    const start = startOfWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const stats = computeStats({
      sales: filterByDate(data.sales, start, end),
      saleItems: [],
      expenses: filterByDate(data.expenses, start, end),
      debts: []
    });

    labels.push(`S${labels.length+1}`);
    values.push(stats.net);
  }

  return { labels, values };
}

export function buildYearlyChart(yearData) {
  const labels = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
  const values = yearData.monthly.map(m => m.net);

  return { labels, values };
}


/* ================================
   🔥 EMPTY STATE
================================ */
export function isEmpty(stats) {
  return (
    stats.total_sales === 0 &&
    stats.total_profit === 0 &&
    stats.total_expenses === 0
  );
}