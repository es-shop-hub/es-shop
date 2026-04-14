import {
  db, collection, addDoc, getDocs, doc, getDoc, updateDoc, Timestamp
} from './firebase.js';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// --- AUTH ---
const auth = getAuth();
let currentUserId = null;

// --- DOM ---
const form = document.getElementById('debtForm');
const tableBody = document.querySelector('#debtTable tbody');

// --- CHECK USER (propre, pas ton hack lent)
async function checkUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) throw new Error("Utilisateur inconnu");

  const data = snap.data();
  if (!data.isActive || !["admin","seller"].includes(data.role)) {
    throw new Error("Accès refusé");
  }
}

// --- STATUS CALC (CENTRALISÉ)
function computeStatus(total, paid) {
  const remaining = total - paid;

  if (remaining <= 0) return { status: "paid", remaining: 0 };
  if (paid > 0) return { status: "partial", remaining };
  return { status: "pending", remaining };
}

// --- CREATE DEBT ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    await checkUser(currentUserId);

    const type = document.getElementById('type').value;
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const total = parseFloat(document.getElementById('amount_total').value);
    const paid = parseFloat(document.getElementById('amount_paid').value || 0);
    const dueDateVal = document.getElementById('dueDate').value;
    const notes = document.getElementById('notes').value.trim();

    if (!name || total <= 0) throw new Error("Champs invalides");

    const { status, remaining } = computeStatus(total, paid);

    await addDoc(collection(db, "debts"), {
      type,
      name,
      phone,

      amount_total: total,
      amount_paid: paid,
      amount_remaining: remaining,

      status,

      dueDate: dueDateVal ? Timestamp.fromDate(new Date(dueDateVal)) : null,
      createdAt: Timestamp.now(),

      relatedSaleId: null,
      relatedPurchaseId: null,

      notes,
      createdBy: currentUserId
    });

    form.reset();
    loadDebts();

  } catch (e) {
    console.error(e);
    alert(e.message);
  }
});

// --- LOAD DEBTS ---
async function loadDebts() {
  tableBody.innerHTML = "";

  const snap = await getDocs(collection(db, "debts"));

  const rows = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  rows.forEach(d => {

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${d.name}</td>
      <td>${d.type}</td>
      <td>${d.amount_total}</td>
      <td>${d.amount_paid}</td>
      <td>${d.amount_remaining}</td>
      <td>${d.status}</td>
      <td>${d.dueDate?.toDate().toLocaleDateString() || ""}</td>
    `;

    // 🔥 couleur status
    const statusCell = tr.children[5];

    if (d.status === "paid") statusCell.style.color = "green";
    else if (d.status === "partial") statusCell.style.color = "orange";
    else statusCell.style.color = "red";

    // 🔥 DETTE EN RETARD (niveau pro)
    if (d.dueDate && d.status !== "paid") {
      const now = new Date();
      const due = d.dueDate.toDate();

      if (due < now) {
        tr.style.background = "#ffe6e6"; // rouge léger
      }
    }

    tableBody.appendChild(tr);
  });
}

// --- ADD PAYMENT (CRITIQUE)
window.addPayment = async (id) => {
  const amount = parseFloat(prompt("Montant payé :"));
  if (!amount || amount <= 0) return;

  const ref = doc(db, "debts", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return alert("Introuvable");

  const d = snap.data();

  const newPaid = (d.amount_paid || 0) + amount;

  const { status, remaining } = computeStatus(d.amount_total, newPaid);

  await updateDoc(ref, {
    amount_paid: newPaid,
    amount_remaining: remaining,
    status
  });

  loadDebts();
};

// --- INIT ---
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.replace("login.html");

  currentUserId = user.uid;

  try {
    await checkUser(currentUserId);
    loadDebts();
  } catch (e) {
    alert(e.message);
  }
});