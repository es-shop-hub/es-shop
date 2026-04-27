// purchases.js - VERSION FINALE PRO v4 (+ filtre côté client bon à <300 produits) + réinvestir 
import { 
  db, collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp, getDoc 
} from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- DOM ---
const purchaseForm = document.getElementById('purchaseForm');
const stockTableBody = document.querySelector('#stockTable tbody');
const productSelect = document.getElementById('productSelect');
const productNameInput = document.getElementById('productName');
const variantInput = document.getElementById('variant');
const imageUrlInput = document.getElementById('imageUrl');

const stockSearch = document.getElementById('stockSearch');
const stockFilter = document.getElementById('stockFilter');

let allProducts = [];

const DEFAULT_MARGIN = 1.3;

const toggleBtn = document.querySelector('.commande button');

toggleBtn.addEventListener('click', () => {
  const f = purchaseForm;
  f.style.display = (f.style.display === "none") ? "flex" : "none";
});

// --- COLLECTIONS ---
const purchasesCol = collection(db, 'purchases');
const purchaseItemsCol = collection(db, 'purchase_items');
const productsCol = collection(db, 'products');
const stockMovementsCol = collection(db, 'stock_movements');
const logsCol = collection(db, 'logs');

//----- recherche et filtre------
if (stockSearch) stockSearch.addEventListener('input', applyFilters);
if (stockFilter) stockFilter.addEventListener('change', applyFilters);

// ----- réinvestissement ------
async function getStockBeforePurchase(productId) {
  const snap = await getDocs(
    query(collection(db, "stock_movements"), where("productId", "==", productId))
  );

  let stock = 0;

  snap.forEach(d => {
    const m = d.data();
    if (m.type === "IN") stock += Number(m.quantity || 0);
    if (m.type === "OUT") stock -= Number(m.quantity || 0);
  });

  return stock;
}

async function computeInvestment(productId, NS, unitPrice) {

  const AS = await getStockBeforePurchase(productId);

  const diff = NS - AS;

  if (diff > 0) {
    return {
      shouldInsert: true,
      reinvested: diff * unitPrice,
      external: 0
    };
  }

  return {
    shouldInsert: false
  };
}

// -----

function applyFilters() {
  let list = [...allProducts];

  const searchValue = stockSearch.value.toLowerCase();
  const filterValue = stockFilter.value;

  if (searchValue) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(searchValue) ||
      (p.variant || "").toLowerCase().includes(searchValue)
    );
  }

  if (filterValue === "low") {
    list = list.filter(p => p.stock_current <= 10);
  }

  renderStock(list);
}

// --- CONFIG ---
const STOCK_ALERT_THRESHOLD = 10;

// --- CHECK USER ---
async function checkUser(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) throw new Error("Utilisateur inconnu");

  const data = userDoc.data();
  if (!data.isActive || (data.role !== "admin" && data.role !== "seller")) {
    throw new Error("Accès refusé");
  }

  return data;
}


// --- AJOUT ACHAT ---
purchaseForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUserId) return alert("Utilisateur non connecté");

  const supplier = document.getElementById('supplierName').value.trim();
  const productId = productSelect.value;

  if (!productId) return alert("Produit obligatoire");

  const selectedProductData = allProducts.find(p => p.id === productId);
  const productName = selectedProductData?.name || "";

  const quantity = parseInt(document.getElementById('quantity').value);
  const rawPrice = document.getElementById('unitPrice').value;
  const unitPrice = rawPrice ? parseFloat(rawPrice) : NaN;

  if (!supplier || !productName || quantity <= 0) {
    return alert("Valeurs invalides");
  }

  try {
    await checkUser(currentUserId);
    const now = serverTimestamp();

    // --- GET CURRENT PRODUCT ---
    const prodRef = doc(db, "products", productId);
    const prodSnap = await getDoc(prodRef);
    if (!prodSnap.exists()) return;

    const currentData = prodSnap.data();

    // --- PRIX FINAL ---
    const finalPrice = isNaN(unitPrice)
      ? currentData.price_buy
      : unitPrice;

    // --- CREATE PURCHASE ---
    const purchaseRef = await addDoc(purchasesCol, {
      supplier,
      total_cost: quantity * finalPrice,
      createdAt: now
    });

    // --- UPDATE PRODUIT (stock +=) ---
    await updateDoc(prodRef, {
      price_buy: finalPrice,
      stock_current: (currentData.stock_current || 0) + quantity,
      updatedAt: now
    });

    // --- PURCHASE ITEM ---
    await addDoc(purchaseItemsCol, {
      purchaseId: purchaseRef.id,
      productId,
      quantity,
      price: finalPrice,
      createdAt: now
    });

    // --- STOCK MOVEMENT ---
    await addDoc(stockMovementsCol, {
      productId,
      type: "IN",
      quantity,
      reason: "purchase",
      referenceId: purchaseRef.id,
      createdBy: currentUserId,
      createdAt: now
    });

    // --- INVEST ---
    const result = await computeInvestment(productId, quantity, finalPrice);

    if (result.shouldInsert) {
      await addDoc(collection(db, "investments"), {
        purchaseId: purchaseRef.id,
        amount: quantity * finalPrice,
        reinvested: result.reinvested,
        external: 0,
        type: "stock",
        createdAt: now,
        createdBy: currentUserId
      });
    }

    // --- LOG ---
    await addDoc(logsCol, {
      userId: currentUserId,
      action: "add_purchase",
      targetId: purchaseRef.id,
      details: { supplier, productName, quantity, finalPrice },
      createdAt: now
    });

    purchaseForm.reset();
    loadStock();

  } catch (err) {
    console.error(err);
    alert(err.message || "Erreur lors de l'achat");
  }
});

// --- LOAD STOCK ---
async function loadStock() {
  stockTableBody.innerHTML = '';
  const prodSnap = await getDocs(productsCol);

  allProducts = [];
  
  productSelect.innerHTML = '<option value="">-- Sélectionner --</option>'; //ici

  prodSnap.forEach(docSnap => {
    const p = docSnap.data();
    if (!p.isActive) return;

    allProducts.push({
      id: docSnap.id,
      ...p
    });
    // AJOUT DIRECT AU SELECT
const opt = document.createElement('option');
opt.value = docSnap.id;
opt.textContent = `${p.name} ${p.variant ? "(" + p.variant + ")" : ""}`;
productSelect.appendChild(opt);
  });

  renderStock(allProducts);
}

// --------- render ----------
function renderStock(list) {
  stockTableBody.innerHTML = '';

  list.forEach(p => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${p.name} ${p.variant ? "(" + p.variant + ")" : ""}</td>
      <td>${p.stock_current}</td>
      <td>${p.price_buy.toFixed(2)} FC</td>
      <td>${(p.stock_current * p.price_buy).toFixed(2)} FC</td>
      <td><button onclick="manualUpdate('${p.id}')">Modifier</button></td>
    `;

    stockTableBody.appendChild(tr);
  });
}

// --- MANUAL UPDATE ---
window.manualUpdate = async (productId) => {
  if (!currentUserId) return alert("Non connecté");

  const newQty = parseInt(prompt("Nouvelle quantité :"));
  if (isNaN(newQty) || newQty < 0) return;

  try {
    await checkUser(currentUserId);

    const prodRef = doc(db, "products", productId);
    const prodSnap = await getDoc(prodRef);
    if (!prodSnap.exists()) return;

    const currentStock = prodSnap.data().stock_current || 0;
    const diff = newQty - currentStock;

    if (diff === 0) return alert("Aucune modification");

    const now = serverTimestamp();

    // 1. update stock
    await updateDoc(prodRef, {
      stock_current: newQty,
      updatedAt: now
    });

    // 2. stock movement
    await addDoc(stockMovementsCol, {
      productId,
      type: diff > 0 ? "IN" : "OUT",
      quantity: Math.abs(diff),
      reason: "manual_correction",
      referenceId: null,
      createdBy: currentUserId,
      createdAt: now
    });

    // 3. PURCHASE (corrigé)
    const purchaseRef = await addDoc(purchasesCol, {
      supplier: "manual",
      total_cost: Math.abs(diff) * prodSnap.data().price_buy,
      createdAt: now
    });

    // 4. PURCHASE ITEM (corrigé)
    await addDoc(purchaseItemsCol, {
      purchaseId: purchaseRef.id,
      productId,
      quantity: Math.abs(diff),
      price: prodSnap.data().price_buy,
      createdAt: now
    });

    // --- RÉINVESTISSEMENT (MANUAL UPDATE) ---
const result = await computeInvestment(
  productId,
  Math.abs(diff),
  prodSnap.data().price_buy
);

if (result.shouldInsert) {
  await addDoc(collection(db, "investments"), {
    purchaseId: purchaseRef.id,
    amount: Math.abs(diff) * prodSnap.data().price_buy,
    reinvested: result.reinvested,
    external: 0,
    type: "stock",
    createdAt: now,
    createdBy: currentUserId
  });
}

    // 6. LOG
    await addDoc(logsCol, {
      userId: currentUserId,
      action: "manual_stock_update",
      targetId: productId,
      details: { oldQty: currentStock, newQty },
      createdAt: now
    });

    loadStock();

  } catch (e) {
    console.error(e);
    alert(e.message);
  }
};

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Utilisateur non connecté !");
    window.location.replace("login.html");
    return;
  }
  currentUserId = user.uid;
  try {
    await checkUser(currentUserId);
    loadStock();
  } catch (e) {
    alert(e.message);
  }
});
  
