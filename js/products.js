// products.js
import { 
  db, collection, getDocs, addDoc, updateDoc, doc, getDoc, Timestamp, enableIndexedDbPersistence 
} from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- OFFLINE ---
enableIndexedDbPersistence(db).catch(err => console.warn("Offline non dispo:", err));

// --- DOM ---
const tableBody = document.getElementById('products-table');
const addBtn = document.querySelector('.add-product button');

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

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

// --- LOAD PRODUCTS ---
async function loadProducts() {
  const prodSnap = await getDocs(collection(db, "products"));
  tableBody.innerHTML = "";

  prodSnap.forEach(docSnap => {
    const p = docSnap.data();
    if (!p.isActive) return;

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>
        <div class="product-img" style="background-image:url('${p.imageUrl || ''}')"></div>
      </td>
      <td>${p.name}</td>
      <td>${p.variant || '-'}</td>
      <td>${p.price_sell.toFixed(2)}$</td>
      <td class="${p.stock_current > p.stock_alert ? 'stock-ok' : 'stock-low'}">
        ${p.stock_current}
      </td>
      <td>
        <button class="btn btn-edit">Modifier</button>
        <button class="btn btn-delete">Désactiver</button>
      </td>
    `;

    tr.querySelector('.btn-edit').addEventListener('click', () => editProduct(docSnap.id, p));
    tr.querySelector('.btn-delete').addEventListener('click', () => deactivateProduct(docSnap.id, p.name));

    tableBody.appendChild(tr);
  });
}

// --- ADD PRODUCT ---
addBtn.addEventListener('click', async () => {
  const name = prompt("Nom produit?");
  const variant = prompt("Variante ? (ex: petit, rouge...)");
  const imageUrl = prompt("URL image ?");
  const price_buy = parseFloat(prompt("Prix achat?"));
  const price_sell = parseFloat(prompt("Prix vente?"));
  const stock = parseInt(prompt("Stock initial?"));

  if (!name || !variant || isNaN(price_buy) || isNaN(price_sell) || isNaN(stock)) {
    return alert("Valeurs invalides");
  }

  const now = Timestamp.now();

  const prodRef = await addDoc(collection(db, "products"), {
    name,
    variant,
    imageUrl: imageUrl || "",
    category: "default",
    price_buy,
    price_sell,
    stock_current: stock,
    stock_alert: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // --- STOCK MOVEMENT (SOURCE DE VÉRITÉ) ---
  await addDoc(collection(db, "stock_movements"), {
    productId: prodRef.id,
    type: "IN",
    quantity: stock,
    reason: "initial",
    referenceId: prodRef.id,
    createdBy: currentUserId,
    createdAt: now
  });

  // --- LOG ---
  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "add_product",
    targetId: prodRef.id,
    details: { name, variant, price_buy, price_sell, stock },
    createdAt: now
  });

  loadProducts();
});

// --- EDIT PRODUCT ---
async function editProduct(id, data) {
  const name = prompt("Nom produit?", data.name);
  const variant = prompt("Variante ?", data.variant || "");
  const imageUrl = prompt("URL image ?", data.imageUrl || "");
  const price_buy = parseFloat(prompt("Prix achat?", data.price_buy));
  const price_sell = parseFloat(prompt("Prix vente?", data.price_sell));

  if (!name || !variant || isNaN(price_buy) || isNaN(price_sell)) {
    return alert("Valeurs invalides");
  }

  const now = Timestamp.now();

  await updateDoc(doc(db, "products", id), {
    name,
    variant,
    imageUrl,
    price_buy,
    price_sell,
    updatedAt: now
  });

  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "edit_product",
    targetId: id,
    details: { name, variant, price_buy, price_sell },
    createdAt: now
  });

  loadProducts();
}

// --- DEACTIVATE PRODUCT ---
async function deactivateProduct(id, name) {
  if (!confirm(`Désactiver ${name} ?`)) return;

  const now = Timestamp.now();

  await updateDoc(doc(db, "products", id), {
    isActive: false,
    updatedAt: now
  });

  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "deactivate_product",
    targetId: id,
    details: { name },
    createdAt: now
  });

  loadProducts();
}

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Utilisateur non connecté !");
    window.location.replace("login.html");
    return;
  }

  try {
    currentUserId = user.uid;
    await checkUser(currentUserId);
    loadProducts();
  } catch (e) {
    alert(e.message);
    console.error(e);
  }
});