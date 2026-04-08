// index.js
import { 
  db, collection, addDoc, getDoc, doc, updateDoc, Timestamp, enableIndexedDbPersistence, getDocs
} from './firebase.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- OFFLINE PERSISTENCE ---
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
  try {
    const snap = await getDocs(collection(db, "products"));
    allProducts = [];

    snap.forEach(docSnap => {
      const p = docSnap.data();
      if (!p || !p.isActive) return;
      if (p.price_min == null) p.price_min = p.price_sell || p.price_buy || 0;
      allProducts.push({ id: docSnap.id, ...p });
    });

    if (!allProducts.length) {
      productsContainer.innerHTML = `<p class="no-products">Aucun produit disponible.</p>`;
    } else {
      renderProducts(allProducts);
    }
  } catch (err) {
    console.error("Erreur lors du chargement des produits :", err);
    productsContainer.innerHTML = `<p class="no-products">Erreur lors du chargement des produits.</p>`;
  }
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
        <h4>${p.name || "Produit inconnu"}</h4>
        ${p.variant ? `<div class="variant">${p.variant}</div>` : ""}
        <p>Stock: ${p.stock_current ?? 0}</p>
        <p>${p.price_sell ? p.price_sell.toFixed(2) : "0.00"}FC</p>
      </div>
    `;
    div.addEventListener('click', () => addToCart(p.id, p, div));
    productsContainer.appendChild(div);
    setTimeout(() => div.classList.add('visible'), 50);
  });

  if (!list.length) productsContainer.innerHTML = `<p class="no-products">Aucun produit ne correspond à votre recherche.</p>`;
}

// --- SEARCH ---
searchInput.addEventListener('input', () => {
  const value = searchInput.value.toLowerCase();
  const filtered = allProducts.filter(p =>
    (p.name && p.name.toLowerCase().includes(value)) ||
    (p.variant && p.variant.toLowerCase().includes(value))
  );
  renderProducts(filtered);
});

// --- ADD TO CART ---
function addToCart(productId, data, element) {
  if (!data || data.stock_current <= 0) return alert("Stock épuisé !");
  if (data.price_min == null) data.price_min = data.price_sell || data.price_buy || 0;

  const exist = cart.find(i => i.productId === productId);
  if (exist && exist.qty >= data.stock_current) return alert("Stock max atteint !");
  
  if (exist) {
    exist.qty++;
    if (exist.price < data.price_min) exist.price = data.price_min;
  } else {
    cart.push({
      productId,
      name: data.name || "Produit inconnu",
      variant: data.variant || "",
      price: data.price_sell || 0,
      price_min: data.price_min,
      price_buy: data.price_buy || 0,
      qty: 1,
      imageUrl: data.imageUrl || ""
    });
  }

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

    // Nom + quantité
    const spanName = document.createElement('span');
    spanName.textContent = `${item.name} ${item.variant ? `(${item.variant})` : ""} x${item.qty}`;
    div.appendChild(spanName);

    // Conteneur prix + input
    const spanPrice = document.createElement('span');

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.value = item.price.toFixed(2);
    priceInput.min = item.price_min;
    priceInput.step = '0.01';
    priceInput.style.width = '70px';

    // Bouton valider prix
    const btnPrice = document.createElement('button');
    btnPrice.textContent = 'OK';
    btnPrice.addEventListener('click', () => {
      const val = parseFloat(priceInput.value);
      if (!isNaN(val) && val >= item.price_min) item.price = val;
      updateCartUI();
    });

    spanPrice.appendChild(priceInput);
    spanPrice.appendChild(btnPrice);

    // Bouton retirer item
    const btnRemove = document.createElement('button');
    btnRemove.textContent = 'x';
    btnRemove.addEventListener('click', () => removeFromCart(item.productId));

    spanPrice.appendChild(btnRemove);
    div.appendChild(spanPrice);

    cartDom.insertBefore(div, cartTotalDom);

    total += item.qty * item.price;
  });

  cartTotalDom.textContent = `Total: ${total.toFixed(2)}FC`;
    }

// --- RECALCUL STOCK CURRENT ---
async function recalcStockCurrent(productId) {
  const movementsSnap = await getDocs(collection(db, "stock_movements"));
  let total = 0;
  movementsSnap.forEach(docSnap => {
    const m = docSnap.data();
    if (m?.productId === productId) total += (m.type === "IN" ? 1 : -1) * (m.quantity || 0);
  });
  await updateDoc(doc(db, "products", productId), { stock_current: total });
  return total;
}

// --- CHECK STOCK ALERT ---
async function checkStockAlert(productId, currentStock) {
  const productDoc = await getDoc(doc(db, "products", productId));
  const stock_alert = productDoc.data()?.stock_alert || 0;
  if (currentStock <= stock_alert) {
    await addDoc(collection(db, "stock_alerts"), { productId, currentStock, triggeredAt: Timestamp.now() });
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
      const d = new Date(saleDateInput.value);
      if (!isNaN(d)) saleDate = Timestamp.fromDate(d);
    }

    cart.forEach(item => { if (item.price < item.price_min) item.price = item.price_min; });

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
      const prodRef = doc(db, "products", item.productId);
      const prodSnap = await getDoc(prodRef);
      if (!prodSnap.exists()) continue;

      const currentStock = prodSnap.data()?.stock_current || 0;
      if (currentStock < item.qty) throw new Error(`Stock insuffisant pour ${item.name}`);

      await addDoc(collection(db, "sale_items"), {
        saleId: saleRef.id,
        productId: item.productId,
        quantity: item.qty,
        price: item.price,
        price_min: item.price_min,
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

    await addDoc(collection(db, "logs"), {
      userId: currentUserId,
      action: "create_sale",
      targetId: saleRef.id,
      details: { items: cart },
      createdAt: Timestamp.now()
    });

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
    console.error("Erreur initialisation :", e);
    productsContainer.innerHTML = `<p class="no-products">Impossible de charger les produits.</p>`;
    alert(e.message);
  }
});
