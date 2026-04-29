import {
  db,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  Timestamp
} from "./firebase.js";

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();

let currentUserId = null;
let allData = [];
let allProducts = [];

const ITEMS_PER_PAGE = 10;
let currentPage = 1;

// ================= DOM =================
const list = document.getElementById("expensesList");
const searchInput = document.getElementById("searchInput");
const filterCategory = document.getElementById("filterCategory");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");

const btnExpense = document.getElementById("addExpenseBtn");
const btnDebt = document.getElementById("addDebtBtn");
const btnProductLoss = document.getElementById("submitProductLoss");
const btnMoneyLoss = document.getElementById("submitMoneyLoss");

// ================= PRODUCTS =================
async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));

  allProducts = [];
  const select = document.getElementById("productSelect");

  select.replaceChildren();

  snap.forEach(d => {
    const p = { id: d.id, ...d.data() };
    allProducts.push(p);

    const option = document.createElement("option");
    option.value = p.id;

    option.textContent = `${p.name} (${p.variant || "standard"}) — stock:${p.stock_current}`;

    select.appendChild(option);
  });
}

// ================= DATA =================
async function loadData() {
  const q = query(collection(db, "expensess"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  allData = [];

  snap.forEach(d => {
    allData.push({ id: d.id, ...d.data() });
  });

  render();
}

// ================= FILTER =================
function getFiltered() {
  return allData.filter(e => {
    const search = searchInput.value.toLowerCase();

    const matchSearch =
      !search ||
      (e.reason || "").toLowerCase().includes(search) ||
      (e.category || "").toLowerCase().includes(search);

    const matchCategory =
      filterCategory.value === "all" ||
      e.category === filterCategory.value;

    const date = e.createdAt?.toDate?.();

    const matchDate =
      (!startDate.value || date >= new Date(startDate.value)) &&
      (!endDate.value || date <= new Date(endDate.value));

    return matchSearch && matchCategory && matchDate;
  });
}

// ================= RENDER =================
function render(page = 1) {
  currentPage = page;

  const data = getFiltered();

  const start = (page - 1) * ITEMS_PER_PAGE;
  const pageData = data.slice(start, start + ITEMS_PER_PAGE);

  list.replaceChildren();

  pageData.forEach(item => {
    const div = document.createElement("div");
    div.className = "expense-item";

    const left = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = `${item.reason} (${item.genre})`;

    const sub = document.createElement("small");
    sub.textContent = item.category || "—";

    left.appendChild(title);
    left.appendChild(sub);

    const amount = document.createElement("div");
    amount.textContent = `${item.amount} FC`;
    amount.style.fontWeight = "bold";

    div.appendChild(left);
    div.appendChild(amount);

    list.appendChild(div);
  });

  renderPagination(data.length);
}

/* " ================= STOCK MOVEMENT =================
async function addStockMovement({ productId, type, quantity, reason, referenceId = null }) {
  await addDoc(collection(db, "stock_movements"), {
    productId,
    type,
    quantity,
    reason,
    referenceId,
    createdBy: currentUserId,
    createdAt: Timestamp.now()
  });
}
*/

// ================= PAGINATION =================
function renderPagination(total) {
  const old = document.getElementById("pagination");
  if (old) old.remove();

  const pages = Math.ceil(total / ITEMS_PER_PAGE);

  const container = document.createElement("div");
  container.id = "pagination";
  container.style.display = "flex";
  container.style.gap = "6px";
  container.style.justifyContent = "center";
  container.style.marginTop = "10px";

  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement("button");

    btn.textContent = i;

    btn.style.padding = "6px 10px";
    btn.style.border = "none";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";

    if (i === currentPage) {
      btn.style.background = "#0B5FFF";
      btn.style.color = "white";
    }

    btn.onclick = () => render(i);

    container.appendChild(btn);
  }

  list.after(container);
}

// ================= EXPENSE =================
btnExpense.addEventListener("click", async () => {
  const label = document.getElementById("label").value;
  const category = document.getElementById("category").value;
  const amount = Number(document.getElementById("amount").value);
  const type = document.getElementById("type").value;
  const relatedTo = document.getElementById("relatedTo").value;
  const note = document.getElementById("note").value;

  if (!label || !amount) return alert("Champs obligatoires");

  await addDoc(collection(db, "expensess"), {
    genre: "expense",
    reason: label,
    category,
    amount,
    type,
    relatedTo: relatedTo || null,
    note: note || "",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: currentUserId
  });

  loadData();
});

// ================= DEBT =================
btnDebt.addEventListener("click", async () => {
  const type = document.getElementById("debtType").value;
  const name = document.getElementById("debtName").value;
  const amount = Number(document.getElementById("debtAmount").value);
  const phone = document.getElementById("debtPhone").value;
  const dueDate = document.getElementById("debtDueDate").value;
  const note = document.getElementById("debtNote").value;

  if (!name || !amount) return alert("Champs obligatoires");

  await addDoc(collection(db, "expensess"), {
    genre: "debt",
    reason: `${type} debt`,
    category: "debt",
    amount,
    type: "variable",
    relatedTo: name,
    phone: phone || null,
    dueDate: dueDate || null,
    note,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: currentUserId
  });

  loadData();
});

// ================= LOSS PRODUCT =================
btnProductLoss.addEventListener("click", async () => {
  const productId = document.getElementById("productSelect").value;
  const qtyLost = Number(document.getElementById("productQuantityLost").value);
  const reason = document.getElementById("productLossReason").value;

  if (!productId || qtyLost <= 0) return alert("Produit invalide");

  const product = allProducts.find(p => p.id === productId);
  if (!product) return alert("Produit introuvable");

  // 1. expense record
  await addDoc(collection(db, "expensess"), {
    genre: "loss",
    reason,
    category: "product_loss",
    amount: 0,
    type: "variable",
    relatedTo: productId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: currentUserId
  });

  // 2. stock update SAFE
  await updateDoc(doc(db, "products", productId), {
    stock_current: Math.max(0, product.stock_current - qtyLost)
  });

  /* 3. stock movement (IMPORTANT)
  await addStockMovement({
    productId,
    type: "OUT",
    quantity: qtyLost,
    reason: "loss"
  });
  */

  loadProducts();
  loadData();
});

// ================= LOSS MONEY =================
btnMoneyLoss.addEventListener("click", async () => {
  const amount = Number(document.getElementById("moneyLostAmount").value);
  const reason = document.getElementById("moneyLossReason").value;

  if (!amount) return alert("Montant requis");

  await addDoc(collection(db, "expensess"), {
    genre: "loss",
    reason,
    category: "money_loss",
    amount,
    type: "variable",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: currentUserId
  });

  loadData();
});

// ================= EVENTS =================
searchInput.addEventListener("input", () => render(1));
filterCategory.addEventListener("change", () => render(1));
startDate.addEventListener("change", () => render(1));
endDate.addEventListener("change", () => render(1));

// ================= AUTH =================
onAuthStateChanged(auth, user => {
  if (!user) return (location.href = "login.html");

  currentUserId = user.uid;

  loadProducts();
  loadData();
});