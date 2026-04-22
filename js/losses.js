// losses.js version finale (correction 5)
import { db, collection, addDoc, doc, updateDoc, deleteDoc, getDocs, getDoc, serverTimestamp } from './firebase.js';
import { query, where } from "firebase/firestore";

const lossProductForm = document.getElementById('lossProductForm');
const lossMoneyForm = document.getElementById('lossMoneyForm');
const lossTableBody = document.querySelector('#lossTable tbody');


const stockMovementsCol = collection(db, 'stock_movements');

const productSelect = document.getElementById("productSelect");

//-------- form --------

// PRODUIT
lossProductForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {

    const productId = productSelect.value;
    const quantityLost = parseInt(document.getElementById('productQuantityLost').value);
    const reason = document.getElementById('productLossReason').value;

    if (!productId || quantityLost <= 0) {
      alert("Valeurs invalides");
      return;
    }

    const now = serverTimestamp();
    const userId = "CURRENT_USER_ID";

    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      alert("Produit introuvable");
      return;
    }

    const product = productSnap.data();

    if (quantityLost > product.stock_current) {
      alert("Stock insuffisant");
      return;
    }

    await addDoc(collection(db, "stock_movements"), {
      productId,
      type: "OUT",
      quantity: quantityLost,
      reason: reason,
      createdBy: userId,
      createdAt: now
    });

    await updateDoc(productRef, {
      stock_current: product.stock_current - quantityLost,
      updatedAt: now
    });

    await addDoc(collection(db, "expenses"), {
      label: `Perte produit ${product.name}`,
      category: "loss",
      amount: (quantityLost * product.price_buy) || 0,
      type: "variable",
      relatedTo: productId,
      createdAt: now,
      createdBy: userId
    });

    await addDoc(collection(db, "logs"), {
      userId,
      action: "loss_product",
      targetId: productId,
      details: { quantity: quantityLost, reason },
      createdAt: now
    });

    alert("OK");
    lossProductForm.reset();
    await loadLosses();

  } catch (err) {
    console.error("CRASH:", err);
    alert("Erreur réelle (voir console)");
  }
});

// ARGENT
lossMoneyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {

    const amount = parseFloat(document.getElementById('moneyLostAmount').value);
    const reason = document.getElementById('moneyLossReason').value;

    if (amount <= 0) {
      alert("Montant invalide");
      return;
    }

    const now = serverTimestamp();
    const userId = "CURRENT_USER_ID";

    await addDoc(collection(db, "expenses"), {
      label: "Perte d'argent",
      category: "loss",
      amount,
      type: "variable",
      relatedTo: null,
      createdAt: now,
      createdBy: userId
    });

    await addDoc(collection(db, "logs"), {
      userId,
      action: "loss_money",
      targetId: null,
      details: { amount, reason },
      createdAt: now
    });

    alert("OK");
    lossMoneyForm.reset();

  } catch (err) {
    console.error(err);
    alert("Erreur");
  }
});

let productsMap = {};

async function loadProductsMap() {
  const snap = await getDocs(collection(db, "products"));

  snap.forEach(docSnap => {
    productsMap[docSnap.id] = docSnap.data();
  });
}

// loadLosses
async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));

  productSelect.innerHTML = "";

  snap.forEach(docSnap => {
    const p = docSnap.data();

    const opt = document.createElement("option");

opt.value = docSnap.id;

opt.textContent =
  `${p.name || "Sans nom"}${p.variant ? ` (${p.variant})` : ""}`;

productSelect.appendChild(opt);
  });
}

// --- Charger historique pertes ---
async function loadLosses() {
  lossTableBody.innerHTML = '';

  const snapshot = await getDocs(stockMovementsCol);

  const losses = snapshot.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(d =>
  ["loss", "break", "stock_error", "other", "correction_loss"].includes(d.reason ||"")
)
    .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))

  losses.forEach(loss => {
    const p = productsMap[loss.productId];

const name = p
  ? `${p.name} ${p.variant ? "(" + p.variant + ")" : ""}`
  : `[ID:${loss.productId}]`;
const reasonLabel = {
  loss: "Perte / vol",
  break: "Casse",
  stock_error: "Erreur stock",
  other: "Autre",
  correction_loss: "Correction"
};

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${name}</td>
      <td>${loss.quantity}</td>
      <td>${reasonLabel[loss.reason] || loss.reason}</td>
      <td>${loss.createdAt?.toDate().toLocaleString() || ''}</td>
      <td>
        <button onclick="correctLoss('${loss.productId}', ${loss.quantity})">
          Corriger
        </button>
      </td>
    `;
    lossTableBody.appendChild(tr);
  });
}

// --- Modifier une perte ---
window.correctLoss = async (productId, quantityToRestore) => {
  if (!productId || quantityToRestore <= 0) {
    return alert("Données invalides");
  }

  const now = serverTimestamp();

  try {
    // 1. récupérer produit
    const productRef = doc(db, "products", productId);
    const productSnap = await getDoc(productRef);

    if (!productSnap.exists()) {
      return alert("Produit introuvable");
    }

    const product = productSnap.data();

    // 2. mouvement inverse (IN)
    await addDoc(collection(db, "stock_movements"), {
  productId,
  type: "IN",
  quantity: quantityToRestore,
  reason: "correction_loss",
  createdAt: now
});

// recalcul réel
const q = query(
  collection(db, "stock_movements"),
  where("productId", "==", productId)
);

const movements = await getDocs(q);

const stock = movements.docs
  .map(d => d.data())
  .reduce((acc, m) => {
    const qty = Number(m.quantity || 0);

    if (!qty) return acc;

    return m.type === "IN"
      ? acc + qty
      : acc - qty;
  }, 0);

await updateDoc(productRef, {
  stock_current: stock,
  updatedAt: now
});

    // 4. log
    await addDoc(collection(db, "logs"), {
      action: "loss_corrected",
      targetId: productId,
      details: {
        quantityRestored: quantityToRestore
      },
      createdAt: now
    });

    alert("Correction produit effectuée");
    await loadLosses();

  } catch (err) {
    console.error(err);
    alert("Erreur correction");
  }
};

// --- Init ---
async function init() {
  try {
      await Promise.all([
          loadProductsMap(),
      loadProducts()
      ]);

      await loadLosses();
  } catch (e) {
    console.error("INIT ERROR:", e);
  }
}

init();
