// index.js
import { 
  db, collection, addDoc, getDoc, doc, updateDoc, Timestamp, enableIndexedDbPersistence, getDocs, query, orderBy, limit
} from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- OFFLINE ---
enableIndexedDbPersistence(db).catch(err => console.warn("Offline persistence non disponible :", err));

// --- DOM ---
const productsContainer = document.getElementById('productsContainer');
const cartDom = document.querySelector('.cart');
const cartTotalDom = cartDom.querySelector('.total');
const sellBtn = cartDom.querySelector('.sell-btn');
const manualDateCheckbox = document.getElementById('manualDate');
const saleDateInput = document.getElementById('saleDate');
const searchInput = document.getElementById('searchInput');

// --- CART ---
let cart = [];
let allProducts = [];

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
  const snap = await getDocs(collection(db, "products"));
  productsContainer.innerHTML = "";
  allProducts = [];

  snap.forEach(docSnap => {
    const p = docSnap.data();
    if (!p.isActive) return;
    allProducts.push({ id: docSnap.id, ...p });
  });

  renderProducts(allProducts);
}

// --- RENDER PRODUCTS ---
function renderProducts(list) {
  productsContainer.innerHTML = "";
  list.forEach(p => {
    const div = document.createElement('div');
    div.classList.add('product', 'fade-in');
    div.dataset.id = p.id;

    if (p.imageUrl) {
      div.style.backgroundImage = `url(${p.imageUrl})`;
      div.style.backgroundSize = "cover";
      div.style.backgroundPosition = "center";
    }

    div.innerHTML = `
      <div class="product-content">
        <h4>${p.name}</h4>
        ${p.variant ? `<div class="variant">${p.variant}</div>` : ""}
        <p>Stock: ${p.stock_current}</p>
        <p>${p.price_sell.toFixed(2)}$</p>
      </div>
    `;

    div.addEventListener('click', () => addToCart(p.id, p, div));
    productsContainer.appendChild(div);

    setTimeout(() => div.classList.add('visible'), 50);
  });
}

// --- SEARCH ---
searchInput.addEventListener('input', () => {
  const value = searchInput.value.toLowerCase();
  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(value) ||
    (p.variant && p.variant.toLowerCase().includes(value))
  );
  renderProducts(filtered);
});

// --- ADD TO CART ---
function addToCart(productId, data, element) {
  if (data.stock_current <= 0) return alert("Stock épuisé !");
  const exist = cart.find(i => i.productId === productId);

  if (exist && exist.qty >= data.stock_current) return alert("Stock max atteint !");
  if (exist) exist.qty++;
  else cart.push({
    name: data.name,
    variant: data.variant || "",
    price: data.price_sell,
    price_min: data.price_min || data.price_buy,
    qty: 1,
    productId,
    price_buy: data.price_buy
  });

  element.classList.add('added');
  setTimeout(() => element.classList.remove('added'), 200);
  updateCartUI();
}

// --- REMOVE FROM CART ---
function removeFromCart(productId) {
  const index = cart.findIndex(i => i.productId === productId);
  if (index !== -1) {
    cart[index].qty--;
    if (cart[index].qty <= 0) cart.splice(index, 1);
  }
  updateCartUI();
}

// --- UPDATE CART UI ---
function updateCartUI() {
  cartDom.querySelectorAll('.cart-item').forEach(item => item.remove());
  let total = 0;

  cart.forEach(item => {
    const div = document.createElement('div');
    div.classList.add('cart-item');
    div.innerHTML = `
      <span>${item.name} ${item.variant ? `(${item.variant})` : ""} x${item.qty}</span>
      <span>${(item.qty * item.price).toFixed(2)}$ <button data-id="${item.productId}">x</button></span>
    `;
    div.querySelector('button').addEventListener('click', () => removeFromCart(item.productId));
    cartDom.insertBefore(div, cartTotalDom);

    total += item.qty * item.price;
  });

  cartTotalDom.textContent = `Total: ${total.toFixed(2)}$`;
}

// --- RECALCUL STOCK CURRENT ---
async function recalcStockCurrent(productId) {
  const movementsSnap = await getDocs(collection(db, "stock_movements"));
  let total = 0;
  movementsSnap.forEach(docSnap => {
    const m = docSnap.data();
    if (m.productId === productId) {
      total += (m.type === "IN" ? 1 : -1) * m.quantity;
    }
  });
  await updateDoc(doc(db, "products", productId), { stock_current: total });
  return total;
}

// --- CHECK STOCK ALERT ---
async function checkStockAlert(productId, currentStock) {
  const productDoc = await getDoc(doc(db, "products", productId));
  const stock_alert = productDoc.data().stock_alert || 0;
  if (currentStock <= stock_alert) {
    await addDoc(collection(db, "stock_alerts"), {
      productId,
      currentStock,
      triggeredAt: Timestamp.now()
    });
  }
}

// --- SELL PROCESS ---
sellBtn.addEventListener('click', async () => {
  if (!currentUserId) return alert("Utilisateur non connecté !");
  if (!cart.length) return alert("Panier vide !");

  try {
    await checkUser(currentUserId);

    let saleDate = Timestamp.now();
    if (manualDateCheckbox.checked && saleDateInput.value) {
      saleDate = Timestamp.fromDate(new Date(saleDateInput.value));
    }

    cart.forEach(item => {
      if (item.price < item.price_min) item.price = item.price_min;
    });

    const totalAmount = cart.reduce((a,b) => a + b.qty * b.price, 0);
    const totalProfit = cart.reduce((a,b) => a + (b.price - b.price_buy) * b.qty, 0);

    // --- CREATE SALE ---
    const saleRef = await addDoc(collection(db, "sales"), {
      sellerId: currentUserId,
      total_amount: totalAmount,
      total_profit: totalProfit,
      status: "active",
      createdAt: saleDate
    });

    const saleDataForReceipt = {
      clientName: "",
      createdAt: saleDate.toDate(),
      items: cart,
      total_amount: totalAmount,
      notes: ""
    };
    document.dispatchEvent(new CustomEvent('sale-created', { detail: saleDataForReceipt }));

    // --- CREATE SALE ITEMS & STOCK MOVEMENTS ---
    for (const item of cart) {
      const prodRef = doc(db, "products", item.productId);
      const prodSnap = await getDoc(prodRef);
      if (!prodSnap.exists()) continue;

      const currentStock = prodSnap.data().stock_current || 0;
      if (currentStock < item.qty) throw new Error(`Stock insuffisant pour ${item.name}`);

      await addDoc(collection(db, "sale_items"), {
        saleId: saleRef.id,
        productId: item.productId,
        quantity: item.qty,
        price: item.price,
        profit: (item.price - item.price_buy) * item.qty
      });

      await addDoc(collection(db, "stock_movements"), {
        productId: item.productId,
        type: "OUT",
        quantity: item.qty,
        reason: "sale",
        referenceId: saleRef.id,
        createdBy: currentUserId,
        createdAt: saleDate
      });

      const newStock = await recalcStockCurrent(item.productId);
      await checkStockAlert(item.productId, newStock);
    }

    // --- LOG ---
    await addDoc(collection(db, "logs"), {
      userId: currentUserId,
      action: "create_sale",
      targetId: saleRef.id,
      details: { items: cart },
      createdAt: Timestamp.now()
    });

    // --- RESET UI ---
    cart = [];
    updateCartUI();
    saleDateInput.value = "";
    manualDateCheckbox.checked = false;
    await loadProducts();

    alert(`Vente enregistrée ! ID: ${saleRef.id}`);

  } catch (e) {
    console.error("Erreur vente :", e);
    alert(e.message || "Erreur lors de la vente !");
  }
});

// --- CANCEL SALE ---
async function cancelSale(saleId) {
  const saleRef = doc(db, "sales", saleId);
  const saleSnap = await getDoc(saleRef);
  if (!saleSnap.exists()) throw new Error("Vente introuvable");

  await updateDoc(saleRef, { status: "cancelled" });

  // Ajouter mouvements correction pour chaque item
  const itemsSnap = await getDocs(collection(db, "sale_items"));
  for (const itemDoc of itemsSnap.docs) {
    const item = itemDoc.data();
    if (item.saleId === saleId) {
      await addDoc(collection(db, "stock_movements"), {
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        reason: "correction",
        referenceId: saleId,
        createdBy: currentUserId,
        createdAt: Timestamp.now()
      });
      await recalcStockCurrent(item.productId);
    }
  }

  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "cancel_sale",
    targetId: saleId,
    details: {},
    createdAt: Timestamp.now()
  });
}

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
    await loadProducts();
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
});