// index.js
import { 
  db, collection, addDoc, getDoc, doc, updateDoc, Timestamp, enableIndexedDbPersistence, getDocs 
} from './firebase.js';

// --- OFFLINE ---
enableIndexedDbPersistence(db).catch(err => console.warn("Offline persistence non disponible :", err));

// --- PANIER ---
let cart = [];

// --- DOM ---
const productsContainer = document.getElementById('productsContainer');
const cartDom = document.querySelector('.cart');
const cartTotalDom = cartDom.querySelector('.total');
const sellBtn = cartDom.querySelector('.sell-btn');
const manualDateCheckbox = document.getElementById('manualDate');
const saleDateInput = document.getElementById('saleDate');

// --- USER ---
const currentUserId = "user_1";

// --- CHECK USER ---
async function checkUser() {
  const userDoc = await getDoc(doc(db, "users", currentUserId));
  if (!userDoc.exists()) throw new Error("Utilisateur inconnu");
  const data = userDoc.data();
  if (!data.isActive || (data.role !== "admin" && data.role !== "seller")) {
    throw new Error("Accès refusé");
  }
  return data;
}

// --- LOAD PRODUCTS (🔥 AJOUT CRITIQUE) ---
async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  productsContainer.innerHTML = "";

  snap.forEach(docSnap => {
    const p = docSnap.data();

    if (!p.isActive) return;

    const div = document.createElement('div');
    div.classList.add('product', 'fade-in');
    div.dataset.id = docSnap.id;

    div.innerHTML = `
      <h4>${p.name}</h4>
      <p>Stock: ${p.stock_current}</p>
      <p>${p.price_sell}$</p>
    `;

    // CLICK → ADD TO CART
    div.addEventListener('click', () => addToCart(docSnap.id, p, div));

    productsContainer.appendChild(div);
  });
}

// --- ADD TO CART ---
function addToCart(productId, data, element) {

  if (data.stock_current <= 0) return alert("Stock épuisé !");

  const exist = cart.find(i => i.productId === productId);

  if (exist) exist.qty++;
  else cart.push({
    name: data.name,
    price: data.price_sell,
    qty: 1,
    productId,
    price_buy: data.price_buy
  });

  element.classList.add('added');
  setTimeout(() => element.classList.remove('added'), 300);

  updateCartUI();
}

// --- UI CART ---
function updateCartUI() {
  cartDom.querySelectorAll('.cart-item').forEach(item => item.remove());

  let total = 0;

  cart.forEach(item => {
    const div = document.createElement('div');
    div.classList.add('cart-item');
    div.innerHTML = `
      <span>${item.name} x${item.qty}</span>
      <span>${(item.qty * item.price).toFixed(2)}$</span>
    `;
    cartDom.insertBefore(div, cartTotalDom);

    total += item.qty * item.price;
  });

  cartTotalDom.textContent = `Total: ${total.toFixed(2)}$`;
}

// --- SELL ---
sellBtn.addEventListener('click', async () => {
  if (cart.length === 0) return alert("Panier vide !");
  
  try {
    const userData = await checkUser();

    let saleDate = Timestamp.now();
    if (manualDateCheckbox.checked && saleDateInput.value) {
      saleDate = Timestamp.fromDate(new Date(saleDateInput.value));
    }

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

    // --- LOOP ITEMS ---
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
        await updateDoc(prodRef, {
          stock_current: Math.max(0, currentStock - item.qty)
        });
      }
    }

    // --- LOG ---
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

    loadProducts(); // 🔥 refresh stock affiché

  } catch (e) {
    console.error("Erreur vente :", e);
    alert("Erreur lors de la vente !");
  }
});

// --- INIT ---
loadProducts();