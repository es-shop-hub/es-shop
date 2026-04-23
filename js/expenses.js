// expenses.js version finale+ search+ filtre+ export
import {
  db, collection, addDoc, getDocs, doc, getDoc, Timestamp, query, orderBy
} from './firebase.js';

import { exportToExcel, exportToPDF } from './expensesExport.js';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- DOM ---
const list = document.getElementById("expensesList");
const totalBox = document.getElementById("totalExpenses");

let allExpenses = [];
  document.getElementById("searchInput").addEventListener("input", debounceRender);

document.getElementById("filterCategory").addEventListener("change", resetAndRender);
document.getElementById("startDate").addEventListener("change", resetAndRender);
document.getElementById("endDate").addEventListener("change", resetAndRender);


document.getElementById("exportExcel").onclick = () => {
  const mode = confirm("Exporter toute la liste filtrée ? OK = tout, Annuler = page actuelle");

  if (mode) {
    exportToExcel(getFilteredExpenses());
  } else {
    exportToExcel(getCurrentPageItems());
  }
};


document.getElementById("exportPDF").onclick = () => {
  exportToPDF(getFilteredExpenses());
};

// ----Pagination fiable----
function resetAndRender() {
  currentPage = 1;
  renderExpenses(1);
}

// --- SECURITY ADMIN ONLY ---
async function checkAdmin(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));

  if (!userDoc.exists()) throw new Error("Utilisateur introuvable");

  const data = userDoc.data();

  if (!data.isActive || data.role !== "admin") {
    throw new Error("Accès refusé");
  }

  return data;
}

// --- FORMAT MONEY ---
function formatMoney(n) {
  return Number(n || 0).toFixed(2) + "FC";
}

// --- LOAD EXPENSES ---
async function loadExpenses() {
  const q = query(collection(db, "expenses"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  allExpenses = [];

  snap.forEach(docSnap => {
    allExpenses.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  currentPage = 1; // 🔥 important
  renderExpenses(1);
}

let searchTimeout;

function debounceRender() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1;
    renderExpenses(1);
  }, 300);
}


// --- RENDER  ---
function renderExpenses(page = 1) {
  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const filter = document.getElementById("filterCategory").value;

  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;

  let filtered = allExpenses
    .filter(e => !search || e.label?.toLowerCase().includes(search))
    .filter(e => filter === "all" || e.category === filter)
    .filter(e => {
      if (!e.createdAt) return false;

      const date = e.createdAt.toDate();

      if (start && date < new Date(start)) return false;
      if (end && date > new Date(end)) return false;

      return true;
    });

  renderPaginated(filtered, page);
}

function getCurrentPageItems() {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  return getFilteredExpenses().slice(start, end);
}

const ITEMS_PER_PAGE = 100;
let currentPage = 1;

function renderPaginated(data, page) {
  currentPage = page;

  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;

  const pageItems = data.slice(start, end);

  list.innerHTML = "";
  const total = data.reduce((sum, e) => sum + (e.amount || 0), 0);

pageItems.forEach(e => {
  const div = document.createElement("div");
  div.className = "expense-item";

  div.innerHTML = `
    <div>
      <strong>${e.label}</strong>
      <small>${e.category} • ${e.type}</small>
    </div>
    <div>${formatMoney(e.amount)}</div>
  `;

  list.appendChild(div);
});

  totalBox.textContent = "Total : " + formatMoney(total);

  renderPaginationControls(data.length);
}

function renderPaginationControls(totalItems) {
  let pagination = document.getElementById("pagination");

  if (!pagination) {
    pagination = document.createElement("div");
    pagination.id = "pagination";
    pagination.style.marginTop = "15px";
    pagination.style.textAlign = "center";
    list.after(pagination);
  }

  pagination.innerHTML = "";

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.style.margin = "3px";

    if (i === currentPage) {
      btn.style.background = "#0B5FFF";
      btn.style.color = "#fff";
    }

    btn.onclick = () => renderExpenses(i);

    pagination.appendChild(btn);
  }
}

//get filter
function getFilteredExpenses() {
  const search = document.getElementById("searchInput").value.toLowerCase().trim();
  const filter = document.getElementById("filterCategory").value;
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;

  return allExpenses
    .filter(e => !search || e.label?.toLowerCase().includes(search))
    .filter(e => filter === "all" || e.category === filter)
    .filter(e => {
      if (!e.createdAt) return false;

      const date = e.createdAt.toDate();

      if (start && date < new Date(start)) return false;
      if (end && date > new Date(end)) return false;

      return true;
    });
}

// --- ADD EXPENSE ---
document.getElementById("addExpenseBtn").addEventListener("click", async (e) => {

  try {
    const label = document.getElementById("label").value.trim();
    const category = document.getElementById("category").value;
    const amount = parseFloat(document.getElementById("amount").value);
    const type = document.getElementById("type").value;
    const note = document.getElementById("note").value.trim();

    // 🔥 VALIDATION SÉRIEUSE
    if (!label) throw new Error("Label obligatoire");
    if (!category) throw new Error("Catégorie obligatoire");
    if (!type) throw new Error("Type obligatoire");

    if (isNaN(amount) || amount <= 0) {
      throw new Error("Montant invalide");
    }

    if (amount > 1000000) {
      throw new Error("Montant suspect"); // anti abus
    }

    // 🔥 SAVE
    await addDoc(collection(db, "expenses"), {
      label,
      category,
      amount,
      type,
      relatedTo: null,
      note: note || "",

      createdAt: Timestamp.now(),
      createdBy: currentUserId
    });

    document.getElementById("label").value = "";
    document.getElementById("amount").value = "";
    document.getElementById("note").value = "";
    document.getElementById("relatedTo").value = "";

    await loadExpenses();
    
    await addDoc(collection(db, "logs"), {
      action: "expense_created",
      targetId: null,
      details: note || "creation d'une dépense",
      createdAt: Timestamp.now(),
      createdBy: currentUserId
    });

    alert("Dépense enregistrée");

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.replace("login.html");

  currentUserId = user.uid;

  try {
    await checkAdmin(currentUserId);
    loadExpenses();
  } catch (e) {
    alert(e.message);
    location.replace("index.html");
  }
});