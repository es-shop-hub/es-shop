// index.js
import { 
  db, collection, addDoc, getDoc, doc, updateDoc, Timestamp, enableIndexedDbPersistence, getDocs 
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
let allProducts = []; // 🔥 cache pour recherche

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

    const product = { id: docSnap.id, ...p };
    allProducts.push(product);
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

    // 🔥 image background
    if (p.imageUrl) {
      div.style.setProperty('--bg', `url(${p.imageUrl})`);
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

    // animation
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

  // 🔥 sécurité stock
  if (exist && exist.qty >= data.stock_current) {
    return alert("Stock max atteint !");
  }

  if (exist) exist.qty++;
  else cart.push({
    name: data.name,
    variant: data.variant || "",
    price: data.price_sell,
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

    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    }
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
      <span>
        ${item.name} ${item.variant ? `(${item.variant})` : ""} x${item.qty}
      </span>
      <span>
        ${(item.qty * item.price).toFixed(2)}$
        <button data-id="${item.productId}">x</button>
      </span>
    `;

    div.querySelector('button').addEventListener('click', () => {
      removeFromCart(item.productId);
    });

    cartDom.insertBefore(div, cartTotalDom);

    total += item.qty * item.price;
  });

  cartTotalDom.textContent = `Total: ${total.toFixed(2)}$`;
}

// --- SELL ---
sellBtn.addEventListener('click', async () => {
  if (cart.length === 0) return alert("Panier vide !");

  try {
    if (!currentUserId) throw new Error("Utilisateur non connecté");
    await checkUser(currentUserId);

    let saleDate = Timestamp.now();
    if (manualDateCheckbox.checked && saleDateInput.value) {
      saleDate = Timestamp.fromDate(new Date(saleDateInput.value));
    }

    const totalAmount = cart.reduce((a,b) => a + b.qty * b.price, 0);
    const totalProfit = cart.reduce((a,b) => a + (b.price - b.price_buy) * b.qty, 0);

    const saleRef = await addDoc(collection(db, "sales"), {
      sellerId: currentUserId,
      total_amount: totalAmount,
      total_profit: totalProfit,
      status: "active",
      createdAt: saleDate
    });

    for (const item of cart) {
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

      const prodRef = doc(db, "products", item.productId);
      const prodSnap = await getDoc(prodRef);

      if (prodSnap.exists()) {
        const currentStock = prodSnap.data().stock_current || 0;

        if (currentStock < item.qty) {
          throw new Error(`Stock insuffisant pour ${item.name}`);
        }

        await updateDoc(prodRef, {
          stock_current: currentStock - item.qty
        });
      }
    }

    await addDoc(collection(db, "logs"), {
      userId: currentUserId,
      action: "create_sale",
      targetId: saleRef.id,
      details: { items: cart },
      createdAt: Timestamp.now()
    });

    alert(`Vente enregistrée ! ID: ${saleRef.id}`);

    cart = [];
    updateCartUI();
    saleDateInput.value = "";
    manualDateCheckbox.checked = false;

    loadProducts();

  } catch (e) {
    console.error("Erreur vente :", e);
    alert(e.message || "Erreur lors de la vente !");
  }
});

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
    loadProducts();
  } catch (e) {
    alert(e.message);
    console.error(e);
  }
});