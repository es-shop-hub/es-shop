// index.js FINAL ULTRA PRO + ANTI DOUBLE VENTE + debts logique 

import { 
  db, collection, addDoc, getDoc, doc, updateDoc, Timestamp, enableIndexedDbPersistence, getDocs, query, where
} from './firebase.js';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- OFFLINE ---
enableIndexedDbPersistence(db).catch(() => {});

// --- DOM ---
const paymentType = document.getElementById('paymentType');
const amountPaidInput = document.getElementById('amountPaid');
const clientNameInput = document.getElementById('clientName');

const productsContainer = document.getElementById('productsContainer');
const cartDom = document.querySelector('.cart');
const cartTotalDom = cartDom.querySelector('.total');
const sellBtn = cartDom.querySelector('.sell-btn');
const manualDateCheckbox = document.getElementById('manualDate');
const saleDateInput = document.getElementById('saleDate');
const searchInput = document.getElementById('searchInput');


// ---- open debts input 
paymentType.addEventListener('change', () => {
  if (paymentType.value === "partial") {
    amountPaidInput.style.display = "block";
  } else {
    amountPaidInput.style.display = "none";
  }
});

// --- STATE ---
let cart = [];
let allProducts = [];
let isProcessingSale = false;   // 🔒 LOCK PRINCIPAL
let lastSaleTime = 0;           // 🔒 ANTI SPAM

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- SECURITY ---
async function checkUser(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) throw new Error("Utilisateur inconnu");

  const data = userDoc.data();
  if (!data.isActive || !["admin","seller"].includes(data.role)) {
    throw new Error("Accès refusé");
  }

  return data;
}

// --- LOAD PRODUCTS ---
async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  allProducts = [];

  snap.forEach(docSnap => {
    const p = docSnap.data();
    if (!p?.isActive) return;

    const price_min = p.price_min ?? p.price_sell ?? p.price_buy ?? 0;

    allProducts.push({
      id: docSnap.id,
      ...p,
      price_min
    });
  });

  renderProducts(allProducts);
}

// --- RENDER ---
function renderProducts(list) {
  productsContainer.innerHTML = "";

  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'product fade-in';
    const img = p.imageUrl || "default.png"; // fallback propre

div.style.backgroundImage = `url(${img})`;
div.style.backgroundSize = "cover";
div.style.backgroundPosition = "center";

    div.innerHTML = `
      <div class="product-content">
        <h4>${p.name}</h4>
        ${p.variant ? `<div>${p.variant}</div>` : ""}
        <p>Stock: ${p.stock_current ?? 0}</p>
        <p>${(p.price_sell || 0).toFixed(2)}FC</p>
      </div>
    `;

    div.onclick = () => addToCart(p);
    productsContainer.appendChild(div);

    setTimeout(() => div.classList.add('visible'), 50);
  });
}

// --- SEARCH ---
searchInput.addEventListener('input', () => {
  const v = searchInput.value.toLowerCase();
  renderProducts(
    allProducts.filter(p =>
      p.name.toLowerCase().includes(v) ||
      (p.variant || "").toLowerCase().includes(v)
    )
  );
});

// --- CART ---
function addToCart(p) {
  if (p.stock_current <= 0) return alert("Stock épuisé");

  const exist = cart.find(i => i.productId === p.id);

  if (exist) {
    if (exist.qty >= p.stock_current) return alert("Stock max atteint");
    exist.qty++;
  } else {
    cart.push({
      productId: p.id,
      name: p.name,
      variant: p.variant || "",
      price: p.price_sell,
      price_min: p.price_min,
      price_buy: p.price_buy || 0,
      qty: 1
    });
  }

  updateCartUI();
}

function removeFromCart(id) {
  const i = cart.findIndex(x => x.productId === id);
  if (i !== -1) {
    cart[i].qty--;
    if (cart[i].qty <= 0) cart.splice(i,1);
  }
  updateCartUI();
}

// --- CART UI ---
function updateCartUI() {
  cartDom.querySelectorAll('.cart-item').forEach(e => e.remove());

  let total = 0;

  cart.forEach(item => {

    const div = document.createElement('div');
    div.className = 'cart-item';

    const name = document.createElement('span');
    name.textContent = `${item.name} x${item.qty}`;

    const controls = document.createElement('span');

    const input = document.createElement('input');
    input.type = "number";
    input.value = item.price;
    input.min = item.price_min;

    const ok = document.createElement('button');
    ok.textContent = "OK";

    ok.onclick = () => {
      const val = parseFloat(input.value);

      if (isNaN(val)) return alert("Prix invalide");
      if (val < item.price_min) return alert(`Minimum: ${item.price_min}`);

      item.price = val;
      updateCartUI();
    };

    const del = document.createElement('button');
    del.textContent = "x";
    del.onclick = () => removeFromCart(item.productId);

    controls.append(input, ok, del);
    div.append(name, controls);

    cartDom.insertBefore(div, cartTotalDom);

    total += item.price * item.qty;
  });

  cartTotalDom.textContent = `Total: ${total.toFixed(2)}FC`;
}

// --- STOCK RECALC ---
async function recalcStock(productId) {
  const snap = await getDocs(
    query(collection(db,"stock_movements"), where("productId","==",productId))
  );

  let total = 0;

  snap.forEach(d => {
    const m = d.data();
    if (m.type === "IN") total += m.quantity;
    else if (m.type === "OUT") total -= m.quantity;
  });

  await updateDoc(doc(db,"products",productId), {
    stock_current: total
  });

  return total;
}

// --- SELL (ANTI DOUBLE) ---
sellBtn.addEventListener('click', async () => {

  // 🔒 LOCK HARD
  if (isProcessingSale) return;

  const nowTime = Date.now();
  if (nowTime - lastSaleTime < 1500) return alert("Attends un peu...");
  lastSaleTime = nowTime;

  if (!cart.length) return alert("Panier vide");

  isProcessingSale = true;
  sellBtn.disabled = true;

  try {
    await checkUser(currentUserId);

    // 🔥 sécurité prix
    for (const item of cart) {
      if (item.price < item.price_min) {
        throw new Error(`Prix < minimum (${item.name})`);
      }
    }

    const saleDate = manualDateCheckbox.checked && saleDateInput.value
      ? Timestamp.fromDate(new Date(saleDateInput.value))
      : Timestamp.now();

    const totalAmount = cart.reduce((a,b)=>a+b.qty*b.price,0);
const totalProfit = cart.reduce((a,b)=>a+(b.price-b.price_buy)*b.qty,0);

const paymentMode = paymentType ? paymentType.value : "full";
let amountPaid = totalAmount;

if (paymentMode === "partial") {
  amountPaid = parseFloat(amountPaidInput.value || 0);

  if (!clientNameInput.value.trim()) {
    throw new Error("Nom client obligatoire pour dette");
  }

  if (isNaN(amountPaid) || amountPaid < 0 || amountPaid > totalAmount) {
    throw new Error("Montant payé invalide");
  }
}

    const saleRef = await addDoc(collection(db,"sales"), {
      sellerId: currentUserId,
      total_amount: totalAmount,
      total_profit: totalProfit,
      status: "active",
payment_status: paymentMode === "full" ? "paid" : "partial",
amount_paid: amountPaid,
amount_remaining: totalAmount - amountPaid,
      createdAt: saleDate
    });

    const soldItems = [...cart];

    for (const item of soldItems) {

      const prod = await getDoc(doc(db,"products",item.productId));
      if (!prod.exists()) throw new Error("Produit supprimé");

      if ((prod.data().stock_current || 0) < item.qty) {
        throw new Error(`Stock insuffisant (${item.name})`);
      }

      await addDoc(collection(db,"sale_items"), {
        saleId: saleRef.id,
        productId: item.productId,
        quantity: item.qty,
        price: item.price,
        price_min: item.price_min,
        profit: (item.price - item.price_buy) * item.qty
      });

      await addDoc(collection(db,"stock_movements"), {
        productId: item.productId,
        type: "OUT",
        quantity: item.qty,
        reason: "sale",
        referenceId: saleRef.id,
        createdBy: currentUserId,
        createdAt: saleDate
      });

      await recalcStock(item.productId);
    }
    if (paymentMode === "partial") {

  await addDoc(collection(db, "debts"), {
    type: "client",
    name: clientNameInput.value || "Client inconnu",
    phone: "",
    
    amount_total: totalAmount,
    amount_paid: amountPaid,
    amount_remaining: totalAmount - amountPaid,

    status: amountPaid === 0 ? "pending" : "partial",

    dueDate: Timestamp.fromDate(new Date(Date.now() + 7*24*60*60*1000)),
    createdAt: Timestamp.now(),

    relatedSaleId: saleRef.id,
    notes: "",

    createdBy: currentUserId
  });

}

    cart = [];
    updateCartUI();
    await loadProducts();

    if (window.generateReceipt) {
      window.generateReceipt({
        saleId: saleRef.id,
        name: clientNameInput.value || "Client inconnu",
        items: soldItems,
        total: totalAmount,
        date: new Date()
      });
    }

    alert("Vente OK");

  } catch (e) {
    console.error(e);
    alert(e.message);
  } finally {
    // 🔒 UNLOCK (CRITIQUE)
    isProcessingSale = false;
    sellBtn.disabled = false;
  }
});

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.replace("login.html");

  currentUserId = user.uid;

  try {
    await checkUser(currentUserId);
    loadProducts();
  } catch (e) {
    alert(e.message);
  }
});
