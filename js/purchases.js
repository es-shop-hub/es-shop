// purchases.js - VERSION FINALE PRO v2 (+ filtre côté client bon à <300 produits) + réinvestir 
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
async function computeReinvestmentAmount(purchaseDate, purchaseCost) {

  // 1. récupérer ventes AVANT achat
  const salesSnap = await getDocs(
    query(collection(db, "sales"), where("createdAt", "<=", purchaseDate))
  );

  let totalSalesAmount = 0;

  salesSnap.forEach(doc => {
    const s = doc.data();
    totalSalesAmount += Number(s.amount_paid || s.total_amount || 0);
  });

  // 2. récupérer dépenses AVANT achat (déjà enregistrées)
  const expensesSnap = await getDocs(
    query(collection(db, "expenses"), where("createdAt", "<=", purchaseDate))
  );

  let totalExpenses = 0;

  expensesSnap.forEach(doc => {
    const e = doc.data();
    totalExpenses += Number(e.amount || 0);
  });

  // 3. cash disponible réel
  const availableCash = totalSalesAmount - totalExpenses;

  // 4. montant réinvesti réel
  const reinvested = Math.min(availableCash, purchaseCost);

  return {
    reinvested,
    external: purchaseCost - reinvested
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
  
  const selectedProductId = productSelect.value;

let productName;

if (selectedProductId === "new") {
  productName = productNameInput.value.trim();
} else {
  const selectedProductData = allProducts.find(p => p.id === selectedProductId);
  productName = selectedProductData?.name || "";
}

  const variant = variantInput.value.trim();
  const imageUrl = imageUrlInput.value.trim();
  const quantity = parseInt(document.getElementById('quantity').value);
  const unitPrice = parseFloat(document.getElementById('unitPrice').value);

  if (!supplier || !productName || quantity <= 0 || unitPrice <= 0) {
    return alert("Valeurs invalides");
  }

  try {
    await checkUser(currentUserId);
    const now = serverTimestamp();

    // --- CREATE PURCHASE ---
    const purchaseRef = await addDoc(purchasesCol, {
      supplier,
      total_cost: quantity * unitPrice,
      createdAt: now
    });

    // --- FIND OR CREATE PRODUCT ---
    const prodQuery = query(
      productsCol,
      where('name', '==', productName),
      where('variant', '==', variant || "")
    );
    const prodSnap = await getDocs(prodQuery);

    let productId;
    if (!prodSnap.empty) {
      productId = prodSnap.docs[0].id;
    } else {
      const newProd = await addDoc(productsCol, {
        name: productName,
        variant: variant || "",
        imageUrl: imageUrl || "",
        category: "default",
        price_buy: unitPrice,
        price_sell: unitPrice * DEFAULT_MARGIN, // marge par défaut
        stock_current: 0,
        stock_alert: STOCK_ALERT_THRESHOLD,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
      productId = newProd.id;
    }

    // --- PURCHASE ITEM ---
    await addDoc(purchaseItemsCol, {
      purchaseId: purchaseRef.id,
      productId,
      quantity,
      price: unitPrice,
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

    // --- RECALCUL STOCK ---
    await recalcStock(productId);
    
    // -- RÉINVESTISSEMENT avec condition-----
    const totalCost = quantity * unitPrice;

const { reinvested, external } = await computeReinvestmentAmount(now, totalCost);

// 🔥 ENREGISTREMENT PROPRE DANS investments
await addDoc(collection(db, "investments"), {
  purchaseId: purchaseRef.id,

  amount: totalCost,
  reinvested,
  external,

  type: "stock",

  createdAt: now,
  createdBy: currentUserId
});

    // --- LOG ---
    await addDoc(logsCol, {
      userId: currentUserId,
      action: "add_purchase",
      targetId: purchaseRef.id,
      details: { supplier, productName, variant, quantity, unitPrice },
      createdAt: now
    });

    purchaseForm.reset();
    loadStock();

  } catch (err) {
    console.error(err);
    alert(err.message || "Erreur lors de l'achat");
  }
});

// --- RECALCUL STOCK ---
async function recalcStock(productId) {
  const movSnap = await getDocs(query(stockMovementsCol, where("productId", "==", productId)));
  let total = 0;
  movSnap.forEach(docSnap => {
    const m = docSnap.data();
    if (m.type === "IN") total += m.quantity;
    if (m.type === "OUT") total -= m.quantity;
  });

  await updateDoc(doc(productsCol, productId), {
    stock_current: total,
    updatedAt: serverTimestamp()
  });
}

// --- LOAD STOCK ---
async function loadStock() {
  stockTableBody.innerHTML = '';
  const prodSnap = await getDocs(productsCol);

  allProducts = [];
  
  productSelect.innerHTML = '<option value="">-- Sélectionner --</option>';

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

    // --- RÉINVESTISSEMENT avec condition-----
    const totalCost = quantity * unitPrice;

const { reinvested, external } = await computeReinvestmentAmount(now, totalCost);

// 🔥 ENREGISTREMENT PROPRE DANS investments
await addDoc(collection(db, "investments"), {
  purchaseId: purchaseRef.id,

  amount: totalCost,
  reinvested,
  external,

  type: "stock",

  createdAt: now,
  createdBy: currentUserId
});

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
