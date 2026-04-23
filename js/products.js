// products.js - VERSION FINALE ULTIME PRO + search 
import { 
  db, collection, getDocs, addDoc, updateDoc, doc, getDoc, Timestamp, enableIndexedDbPersistence, query, where
} from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- OFFLINE ---
enableIndexedDbPersistence(db).catch(err => console.warn("Offline non dispo:", err));

// --- DOM ---
const tableBody = document.getElementById('products-table');
const addBtn = document.querySelector('.add-product button');
const searchInput = document.getElementById('searchInput');
let allProducts = [];

function applySearch(value) {
  const v = value.toLowerCase().trim();

  const filtered = allProducts.filter(docSnap => {
    const p = docSnap.data();

    return (
      p.name?.toLowerCase().includes(v) ||
      p.variant?.toLowerCase().includes(v)
    );
  });

  renderProducts(filtered);
}

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

// --- RECALCUL STOCK ---
async function recalcStock(productId) {
  const movSnap = await getDocs(query(collection(db, "stock_movements"), where("productId", "==", productId)));
  let total = 0;
  movSnap.forEach(docSnap => {
    const m = docSnap.data();
    if (m.type === "IN") total += m.quantity;
    if (m.type === "OUT") total -= m.quantity;
  });
  await updateDoc(doc(db, "products", productId), { stock_current: total, updatedAt: Timestamp.now() });
  return total;
}

// ------ render
function renderProducts(productsDocs) {
  tableBody.innerHTML = "";

  productsDocs.forEach(docSnap => {
    const p = docSnap.data();

    const priceSell = p.price_sell ?? 0;
    const priceMin = p.price_min ?? priceSell;
    const stockCurrent = p.stock_current ?? 0;

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><div class="product-img" style="background-image:url('${p.imageUrl || ''}')"></div></td>
      <td>${p.name}</td>
      <td>${p.variant || '-'}</td>
      <td>${priceSell.toFixed(2)}FC</td>
      <td>${priceMin.toFixed(2)}FC</td>
      <td class="${stockCurrent > p.stock_alert ? 'stock-ok' : 'stock-low'}">${stockCurrent}</td>
      <td>
        <button class="btn btn-edit">Modifier</button>
        <button class="btn btn-delete">Désactiver</button>
      </td>
    `;

    tr.querySelector('.btn-edit').onclick = () => editProduct(docSnap.id, p);
    tr.querySelector('.btn-delete').onclick = () => deactivateProduct(docSnap.id, p.name);

    tableBody.appendChild(tr);
  });
}

// search box 
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const value = e.target.value.toLowerCase().trim();

    const filtered = allProducts.filter(docSnap => {
      const p = docSnap.data();

      return (
        p.name?.toLowerCase().includes(value) ||
        p.variant?.toLowerCase().includes(value)
      );
    });

    renderProducts(filtered);
  });
}

// --- LOAD PRODUCTS ---
async function loadProducts() {
  const prodSnap = await getDocs(collection(db, "products"));

  allProducts = prodSnap.docs.filter(d => d.data().isActive);

  if (searchInput) searchInput.value = ""; // reset search

  renderProducts(allProducts);
}

// --- ADD PRODUCT ---
addBtn.addEventListener('click', async () => {
  const name = prompt("Nom produit?");
  const variant = prompt("Variante ? (ex: petit, rouge...)");
  const imageUrl = prompt("URL image ?");
  const price_buy = parseFloat(prompt("Prix achat?"));
  const price_sell = parseFloat(prompt("Prix vente?"));
  const price_min = parseFloat(prompt("Prix minimum autorisé?"));
  const stock = parseInt(prompt("Stock initial?"));

  if (!name || !variant || isNaN(price_buy) || isNaN(price_sell) || isNaN(stock) || isNaN(price_min)) {
    return alert("Valeurs invalides");
  }
  if (price_min <= price_buy) return alert("Prix minimum doit être supérieur au prix d'achat !");
  if (price_sell < price_min) return alert("Prix vente < prix minimum !");

  const now = Timestamp.now();

  const prodRef = await addDoc(collection(db, "products"), {
    name,
    variant,
    imageUrl: imageUrl || "",
    category: "default",
    price_buy,
    price_sell,
    price_min,
    stock_current: stock,
    stock_alert: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now
  });

  // --- STOCK MOVEMENT ---
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
    details: { name, variant, price_buy, price_sell, price_min, stock },
    createdAt: now
  });

  await recalcStock(prodRef.id);
  loadProducts();
});

// --- EDIT PRODUCT ---
async function editProduct(id, data) {
  const name = prompt("Nom produit?", data.name);
  const variant = prompt("Variante ?", data.variant || "");
  const imageUrl = prompt("URL image ?", data.imageUrl || "");
  const price_buy = parseFloat(prompt("Prix achat?", data.price_buy));
  const price_sell = parseFloat(prompt("Prix vente?", data.price_sell));
  const price_min = parseFloat(prompt("Prix minimum autorisé?", data.price_min || data.price_sell));

  if (!name || !variant || isNaN(price_buy) || isNaN(price_sell) || isNaN(price_min)) {
    return alert("Valeurs invalides");
  }
  if (price_min <= price_buy) return alert("Prix minimum doit être supérieur au prix d'achat !");
  if (price_sell < price_min) return alert("Prix vente < prix minimum !");

  const now = Timestamp.now();

  await updateDoc(doc(db, "products", id), {
    name,
    variant,
    imageUrl,
    price_buy,
    price_sell,
    price_min,
    updatedAt: now
  });

  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "edit_product",
    targetId: id,
    details: { name, variant, price_buy, price_sell, price_min },
    createdAt: now
  });

  await recalcStock(id);
  loadProducts();
}

// --- DEACTIVATE PRODUCT ---
async function deactivateProduct(id, name) {
  if (!confirm(`Désactiver ${name} ?`)) return;

  const now = Timestamp.now();

  await updateDoc(doc(db, "products", id), { isActive: false, updatedAt: now });
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
