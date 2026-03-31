// purchases.js
import { 
  db, collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp 
} from './firebase.js';

import { 
  getAuth, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- DOM ---
const purchaseForm = document.getElementById('purchaseForm');
const stockTableBody = document.querySelector('#stockTable tbody');

// --- COLLECTIONS ---
const purchasesCol = collection(db, 'purchases');
const purchaseItemsCol = collection(db, 'purchase_items');
const productsCol = collection(db, 'products');
const stockMovementsCol = collection(db, 'stock_movements');
const logsCol = collection(db, 'logs');

// --- CONFIG ---
const STOCK_ALERT_THRESHOLD = 10;

// --- CHECK USER ---
async function checkUser(uid) {
  const userSnap = await getDocs(query(collection(db, "users"), where("__name__", "==", uid)));
  
  // 🔴 correction: on prend doc direct
  const userDoc = await getDocs(collection(db, "users"));
  const user = userDoc.docs.find(d => d.id === uid);

  if (!user) throw new Error("Utilisateur inconnu");

  const data = user.data();

  if (!data.isActive || (data.role !== "admin" && data.role !== "seller")) {
    throw new Error("Accès refusé");
  }

  return data;
}

// --- AJOUT COMMANDE ---
purchaseForm.addEventListener('submit', async e => {
  e.preventDefault();

  if (!currentUserId) return alert("Utilisateur non connecté");

  const supplier = document.getElementById('supplierName').value.trim();
  const productName = document.getElementById('productName').value.trim();
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
    const prodQuery = query(productsCol, where('name', '==', productName));
    const prodSnap = await getDocs(prodQuery);

    let productId;

    if (!prodSnap.empty) {
      productId = prodSnap.docs[0].id;
    } else {
      const newProd = await addDoc(productsCol, {
        name: productName,
        category: "default",
        price_buy: unitPrice,
        price_sell: unitPrice * 1.3,
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
      price: unitPrice
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

    // --- LOG ---
    await addDoc(logsCol, {
      userId: currentUserId,
      action: "add_purchase",
      targetId: purchaseRef.id,
      details: { supplier, productName, quantity, unitPrice },
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
    if (m.type === "OUT" || m.type === "loss") total -= m.quantity;
  });

  await updateDoc(doc(productsCol, productId), {
    stock_current: total,
    updatedAt: serverTimestamp()
  });

  if (total <= STOCK_ALERT_THRESHOLD) {
    console.warn(`⚠️ Stock critique: ${productId} → ${total}`);
  }
}

// --- LOAD STOCK ---
async function loadStock() {
  stockTableBody.innerHTML = '';
  const prodSnap = await getDocs(productsCol);

  prodSnap.forEach(docSnap => {
    const p = docSnap.data();
    if (!p.isActive) return;

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>-</td>
      <td>${p.stock_current}</td>
      <td>${p.price_buy.toFixed(2)} $</td>
      <td>${(p.stock_current * p.price_buy).toFixed(2)} $</td>
      <td><button onclick="manualUpdate('${docSnap.id}')">Modifier</button></td>
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

    await updateDoc(doc(productsCol, productId), {
      stock_current: newQty,
      updatedAt: serverTimestamp()
    });

    await addDoc(stockMovementsCol, {
      productId,
      type: "IN",
      quantity: newQty,
      reason: "manualUpdate",
      referenceId: null,
      createdBy: currentUserId,
      createdAt: serverTimestamp()
    });

    await addDoc(logsCol, {
      userId: currentUserId,
      action: "manual_stock_update",
      targetId: productId,
      details: { newQty },
      createdAt: serverTimestamp()
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
