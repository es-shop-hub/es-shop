// stats.js ultra-pro v2
import { 
  db, collection, getDocs, addDoc, doc, enableIndexedDbPersistence, Timestamp 
} from './firebase.js';
import jsPDF from 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

// --- OFFLINE PERSISTENCE ---
enableIndexedDbPersistence(db).catch(err => console.warn("Offline non dispo:", err));

// --- DOM ---
const dailyContainer = document.getElementById('daily-totals');
const weeklyContainer = document.getElementById('weekly-totals');
const monthlyContainer = document.getElementById('monthly-totals');
const yearlyContainer = document.getElementById('yearly-total');
const exportWeekBtn = document.getElementById('export-week');
const exportMonthBtn = document.getElementById('export-month');
const exportYearBtn = document.getElementById('export-year');

// --- UTILISATEUR COURANT ---
const currentUserId = "user_1"; // remplacer par auth réel

async function checkUser() {
  const usersSnap = await getDocs(collection(db, "users"));
  const userDoc = usersSnap.docs.find(d => d.id === currentUserId);
  if (!userDoc) throw new Error("Utilisateur inconnu");
  const data = userDoc.data();
  if (!data.isActive || (data.role !== "admin" && data.role !== "seller")) throw new Error("Accès refusé");
  return data;
}

// --- LOAD VENTES ---
async function loadSales() {
  const salesSnap = await getDocs(collection(db, "sales"));
  return salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// --- LOGS ---
async function logAction(action, targetId, details = {}) {
  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action,
    targetId,
    details,
    createdAt: Timestamp.now()
  });
}

// --- CALCULS ---
function calculateWeekly(sales) {
  const now = new Date();
  const daily = Array(7).fill(0);
  const dailyProfit = Array(7).fill(0);

  sales.forEach(sale => {
    const d = sale.createdAt.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt);
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
    const d = sale.createdAt.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt);
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
    const d = sale.createdAt.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt);
    if(d.getFullYear() === year) {
      const idx = d.getMonth();
      months[idx] += sale.total_amount || 0;
      monthsProfit[idx] += sale.total_profit || 0;
    }
  });
  return { months, monthsProfit };
}

// --- RENDER ---
function renderWeekly(data) {
  const { daily, dailyProfit } = data;
  dailyContainer.innerHTML = daily.map((v,i)=>`<div>J-${6-i}: Vente ${v.toFixed(2)}$ / Profit ${dailyProfit[i].toFixed(2)}$</div>`).join('');
}

function renderMonthly(data) {
  const { weeks, weeksProfit } = data;
  weeklyContainer.innerHTML = weeks.map((v,i)=>`<div>S-${4-i}: Vente ${v.toFixed(2)}$ / Profit ${weeksProfit[i].toFixed(2)}$</div>`).join('');
}

function renderYearly(data) {
  const { months, monthsProfit } = data;
  monthlyContainer.innerHTML = months.map((v,i)=>`<div>${i+1}/${new Date().getFullYear()}: Vente ${v.toFixed(2)}$ / Profit ${monthsProfit[i].toFixed(2)}$</div>`).join('');
  yearlyContainer.innerHTML = `<div>Total annuel: Vente ${months.reduce((a,b)=>a+b,0).toFixed(2)}$ / Profit ${monthsProfit.reduce((a,b)=>a+b,0).toFixed(2)}$</div>`;
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
    doc.text(` - ${div.innerText}`, 14, y);
    y += 6;
  });
  doc.save(`${title.replace(/\s/g,'_')}_${new Date().toISOString().split('T')[0]}.pdf`);
}

exportWeekBtn.addEventListener('click', ()=>exportPDF('Stats Hebdomadaire', dailyContainer));
exportMonthBtn.addEventListener('click', ()=>exportPDF('Stats Mensuelle', weeklyContainer));
exportYearBtn.addEventListener('click', ()=>exportPDF('Stats Annuelle', yearlyContainer));

// --- INIT ---
(async () => {
  try {
    await checkUser();
    const sales = await loadSales();
    renderWeekly(calculateWeekly(sales));
    renderMonthly(calculateMonthly(sales));
    renderYearly(calculateYearly(sales));
  } catch(e) {
    alert(e.message);
    console.error(e);
  }
})();