// purchases.js
import { 
  db, collection, addDoc, getDocs, doc, updateDoc, query, where, serverTimestamp 
} from './firebase.js';

// --- DOM ---
const purchaseForm = document.getElementById('purchaseForm');
const stockTableBody = document.querySelector('#stockTable tbody');

// --- COLLECTIONS ---
const purchasesCol = collection(db, 'purchases');
const purchaseItemsCol = collection(db, 'purchase_items');
const productsCol = collection(db, 'products');
const stockMovementsCol = collection(db, 'stock_movements');
const logsCol = collection(db, 'logs');

// --- SEUIL ALERTES ---
const STOCK_ALERT_THRESHOLD = 10;

// --- AJOUT COMMANDE ---
purchaseForm.addEventListener('submit', async e => {
  e.preventDefault();

  const supplier = document.getElementById('supplierName').value.trim();
  const productName = document.getElementById('productName').value.trim();
  const quantity = parseInt(document.getElementById('quantity').value);
  const unitPrice = parseFloat(document.getElementById('unitPrice').value);

  if (!supplier || !productName || quantity <= 0 || unitPrice <= 0) return alert("Valeurs invalides");

  try {
    // --- AJOUT PURCHASE ---
    const purchaseRef = await addDoc(purchasesCol, {
      supplier,
      total_cost: quantity * unitPrice,
      createdAt: serverTimestamp()
    });

    // --- RECUP PRODUCT ---
    const prodQuery = query(productsCol, where('name', '==', productName));
    const prodSnap = await getDocs(prodQuery);
    let productId;

    if (!prodSnap.empty) {
      // produit existant
      const prodDoc = prodSnap.docs[0];
      productId = prodDoc.id;
    } else {
      // produit nouveau
      const prodDocRef = await addDoc(productsCol, {
        name: productName,
        category: "default",
        price_buy: unitPrice,
        price_sell: unitPrice * 1.3, // marge par défaut 30%
        stock_current: 0,
        stock_alert: STOCK_ALERT_THRESHOLD,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      productId = prodDocRef.id;
    }

    // --- AJOUT purchase_item ---
    await addDoc(purchaseItemsCol, {
      purchaseId: purchaseRef.id,
      productId,
      quantity,
      price: unitPrice
    });

    // --- AJOUT stock_movement IN ---
    await addDoc(stockMovementsCol, {
      productId,
      type: "IN",
      quantity,
      reason: "purchase",
      referenceId: purchaseRef.id,
      createdBy: "user_1", // remplacer par auth réel
      createdAt: serverTimestamp()
    });

    // --- RECALCUL stock_current ---
    await recalcStock(productId);

    // --- LOG ---
    await addDoc(logsCol, {
      userId: "user_1",
      action: "add_purchase",
      targetId: purchaseRef.id,
      details: { supplier, productName, quantity, unitPrice },
      createdAt: serverTimestamp()
    });

    purchaseForm.reset();
    loadStock();

  } catch (err) {
    console.error(err);
    alert("Erreur lors de l'ajout de la commande");
  }
});

// --- RECALCUL stock_current depuis stock_movements ---
async function recalcStock(productId) {
  const movSnap = await getDocs(query(stockMovementsCol, where("productId", "==", productId)));
  let total = 0;

  movSnap.forEach(docSnap => {
    const m = docSnap.data();
    if (m.type === "IN") total += m.quantity;
    if (m.type === "OUT" || m.type === "loss") total -= m.quantity;
  });

  await updateDoc(doc(productsCol, productId), { stock_current: total, updatedAt: serverTimestamp() });

  if (total <= STOCK_ALERT_THRESHOLD) {
    console.warn(`ALERTE : Stock critique pour ${productId} → ${total} unités`);
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

// --- UPDATE MANUEL stock_current ---
window.manualUpdate = async productId => {
  const newQty = parseInt(prompt("Nouvelle quantité :"));
  if (isNaN(newQty) || newQty < 0) return;

  const prodRef = doc(productsCol, productId);
  const prodSnap = await getDocs(query(productsCol, where("name", "==", productId)));
  const prodData = prodSnap.docs.find(d => d.id === productId)?.data();

  await updateDoc(prodRef, { stock_current: newQty, updatedAt: serverTimestamp() });

  // --- LOG STOCK MANUEL ---
  await addDoc(stockMovementsCol, {
    productId,
    type: "IN",
    quantity: newQty,
    reason: "manualUpdate",
    referenceId: null,
    createdBy: "user_1",
    createdAt: serverTimestamp()
  });

  await addDoc(logsCol, {
    userId: "user_1",
    action: "manual_stock_update",
    targetId: productId,
    details: { newQty },
    createdAt: serverTimestamp()
  });

  loadStock();
}

// --- INIT ---
loadStock();