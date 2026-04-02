// stats.js ultra-pro v3 (CORRIGÉ)
import { 
  db, collection, getDocs, addDoc, doc, getDoc,
  enableIndexedDbPersistence, Timestamp 
} from './firebase.js';

import { 
  getAuth, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

import jsPDF from 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

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

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- CHECK USER (CORRIGÉ) ---
async function checkUser(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) throw new Error("Utilisateur inconnu");

  const data = userDoc.data();

  if (!data.isActive || (data.role !== "admin" && data.role !== "seller")) {
    throw new Error("Accès refusé");
  }

  return data;
}

// --- LOAD SALES ---
async function loadSales() {
  const salesSnap = await getDocs(collection(db, "sales"));

  return salesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.status === "active"); // cohérence avec ton index.js
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

// --- SAFE DATE ---
function getDate(sale) {
  if (!sale.createdAt) return new Date();
  return sale.createdAt.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt);
}

// --- CALCULS ---
function calculateWeekly(sales) {
  const now = new Date();
  const daily = Array(7).fill(0);
  const dailyProfit = Array(7).fill(0);

  sales.forEach(sale => {
    const d = getDate(sale);
    const diffDays = Math.floor((now - d)/(1000*60*60*24));

    if(diffDays < 7) {
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
    const diffDays = Math.floor((now - d)/(1000*60*60*24));
    const weekNum = Math.floor(diffDays/7);

    if(weekNum < 5) {
      const idx = 4 - weekNum;
      weeks[idx] += sale.total_amount || 0;
      weeksProfit[idx] += sale.total_profit || 0;
    }
  });

  return { weeks, weeksProfit };
}

function calculateYearly(sales) {
  const months = Array(12).fill(0);
  const monthsProfit = Array(12).fill(0);
  const year = new Date().getFullYear();

  sales.forEach(sale => {
    const d = getDate(sale);

    if(d.getFullYear() === year) {
      const idx = d.getMonth();
      months[idx] += sale.total_amount || 0;
      monthsProfit[idx] += sale.total_profit || 0;
    }
  });

  return { months, monthsProfit };
}

// --- FORMAT FC ---
function fc(v) {
  return `${v.toFixed(0)} FC`;
}

// --- RENDER ---
function renderWeekly(data) {
  const { daily, dailyProfit } = data;

  dailyContainer.innerHTML = daily.map((v,i)=>
    `<div>J-${6-i}: Vente ${fc(v)} / Profit ${fc(dailyProfit[i])}</div>`
  ).join('');
}

function renderMonthly(data) {
  const { weeks, weeksProfit } = data;

  weeklyContainer.innerHTML = weeks.map((v,i)=>
    `<div>S-${4-i}: Vente ${fc(v)} / Profit ${fc(weeksProfit[i])}</div>`
  ).join('');
}

function renderYearly(data) {
  const { months, monthsProfit } = data;

  monthlyContainer.innerHTML = months.map((v,i)=>
    `<div>${i+1}/${new Date().getFullYear()}: Vente ${fc(v)} / Profit ${fc(monthsProfit[i])}</div>`
  ).join('');

  yearlyContainer.innerHTML = `
    <div>
      Total annuel: Vente ${fc(months.reduce((a,b)=>a+b,0))} 
      / Profit ${fc(monthsProfit.reduce((a,b)=>a+b,0))}
    </div>`;
}

// --- EXPORT PDF ---
function exportPDF(title, container) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text(title, 14, 20);

  let y = 30;

  container.querySelectorAll('div').forEach(div => {
    doc.setFontSize(12);
    doc.text(`- ${div.innerText}`, 14, y);
    y += 6;
  });

  doc.save(`${title.replace(/\s/g,'_')}.pdf`);
}

// --- EVENTS ---
exportWeekBtn.addEventListener('click', ()=>exportPDF('Stats Hebdomadaire', dailyContainer));
exportMonthBtn.addEventListener('click', ()=>exportPDF('Stats Mensuelle', weeklyContainer));
exportYearBtn.addEventListener('click', ()=>exportPDF('Stats Annuelle', yearlyContainer));

// --- INIT (CORRIGÉ AUTH) ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Non connecté");
    window.location.replace("login.html");
    return;
  }

  currentUserId = user.uid;

  try {
    await checkUser(currentUserId);

    const sales = await loadSales();

    renderWeekly(calculateWeekly(sales));
    renderMonthly(calculateMonthly(sales));
    renderYearly(calculateYearly(sales));

  } catch(e) {
    alert(e.message);
    console.error(e);
  }
});
