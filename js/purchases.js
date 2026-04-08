// purchases.js - VERSION FINALE PRO
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
  const selectedProduct = productSelect.value;
  const productName = selectedProduct === "new"
    ? productNameInput.value.trim()
    : selectedProduct;
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
        price_sell: unitPrice * 1.3, // marge par défaut
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
  prodSnap.forEach(docSnap => {
    const p = docSnap.data();
    if (!p.isActive) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.name} ${p.variant ? "(" + p.variant + ")" : ""}</td>
      <td>${p.stock_current}</td>
      <td>${p.price_buy.toFixed(2)} FC</td>
      <td>${(p.stock_current * p.price_buy).toFixed(2)} FC</td>
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
    const prodRef = doc(db, "products", productId);
    const prodSnap = await getDoc(prodRef);
    if (!prodSnap.exists()) return;

    const currentStock = prodSnap.data().stock_current || 0;
    const diff = newQty - currentStock;
    if (diff === 0) return alert("Aucune modification");

    await updateDoc(prodRef, {
      stock_current: newQty,
      updatedAt: serverTimestamp()
    });

    await addDoc(stockMovementsCol, {
      productId,
      type: diff > 0 ? "IN" : "OUT",
      quantity: Math.abs(diff),
      reason: "manual_correction",
      referenceId: null,
      createdBy: currentUserId,
      createdAt: serverTimestamp()
    });

    await addDoc(logsCol, {
      userId: currentUserId,
      action: "manual_stock_update",
      targetId: productId,
      details: { oldQty: currentStock, newQty },
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
