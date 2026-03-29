import { db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from './firebase.js';

const lossForm = document.getElementById('lossForm');
const lossTableBody = document.querySelector('#lossTable tbody');

const stockCollection = collection(db, 'stock');
const stockHistoryCollection = collection(db, 'stockHistory');
const lossesCollection = collection(db, 'losses'); // Optionnel pour tracking dédié

// --- Déclarer une perte ---
lossForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const productName = document.getElementById('productName').value.trim();
  const quantityLost = parseInt(document.getElementById('quantityLost').value);
  const reason = document.getElementById('reason').value;

  if (!productName || quantityLost <= 0) return alert("Remplir tous les champs correctement.");

  // Chercher le produit dans le stock
  const stockSnapshot = await getDocs(stockCollection);
  const productDoc = stockSnapshot.docs.find(d => d.data().productName === productName);

  if (!productDoc) return alert("Produit introuvable dans le stock.");

  const currentQty = productDoc.data().quantity;
  const newQty = currentQty - quantityLost;
  if (newQty < 0) return alert("Quantité insuffisante dans le stock pour cette perte.");

  // Mettre à jour le stock
  await updateDoc(doc(db, 'stock', productDoc.id), { quantity: newQty });

  // Ajouter la perte dans stockHistory
  const lossEntry = {
    productName,
    quantity: quantityLost,
    type: 'loss',
    reason,
    timestamp: serverTimestamp()
  };
  const stockHistoryDoc = await addDoc(stockHistoryCollection, lossEntry);
  await addDoc(lossesCollection, { ...lossEntry, historyId: stockHistoryDoc.id });

  lossForm.reset();
  loadLosses();
});

// --- Charger historique pertes ---
async function loadLosses() {
  lossTableBody.innerHTML = '';
  const snapshot = await getDocs(stockHistoryCollection);
  const losses = snapshot.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(d => d.type === 'loss')
    .sort((a,b) => b.timestamp?.seconds - a.timestamp?.seconds); // plus récent en haut

  losses.forEach(loss => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${loss.productName}</td>
      <td>${loss.quantity}</td>
      <td>${loss.reason}</td>
      <td>${loss.timestamp?.toDate().toLocaleString() || ''}</td>
      <td>
        <button onclick="editLoss('${loss.id}')">Modifier</button>
        <button onclick="deleteLoss('${loss.id}')">Supprimer</button>
      </td>
    `;
    lossTableBody.appendChild(tr);
  });
}

// --- Modifier une perte ---
window.editLoss = async (id) => {
  const docRef = doc(db, 'stockHistory', id);
  const docSnap = await getDocs(collection(db, 'stockHistory'));
  const lossDoc = docSnap.docs.find(d => d.id === id);
  if (!lossDoc) return alert("Perte introuvable.");

  const data = lossDoc.data();
  const newName = prompt("Produit :", data.productName) || data.productName;
  const newQty = parseInt(prompt("Quantité :", data.quantity) || data.quantity);
  const newReason = prompt("Raison :", data.reason) || data.reason;

  if (!newName || newQty <= 0) return alert("Champs invalides.");

  // Ajuster le stock : remettre l'ancienne quantité et retirer la nouvelle
  const stockSnap = await getDocs(stockCollection);
  const productDoc = stockSnap.docs.find(d => d.data().productName === data.productName);
  if (!productDoc) return alert("Produit introuvable pour mise à jour stock.");

  let currentQty = productDoc.data().quantity;
  currentQty += data.quantity; // remettre quantité précédente
  const updatedQty = currentQty - newQty;
  if (updatedQty < 0) return alert("Stock insuffisant pour cette modification.");

  await updateDoc(doc(db, 'stock', productDoc.id), { quantity: updatedQty });
  await updateDoc(docRef, { productName: newName, quantity: newQty, reason: newReason });

  loadLosses();
};

// --- Supprimer une perte ---
window.deleteLoss = async (id) => {
  if (!confirm("Supprimer définitivement cette perte ?")) return;

  const docRef = doc(db, 'stockHistory', id);
  const docSnap = await getDocs(collection(db, 'stockHistory'));
  const lossDoc = docSnap.docs.find(d => d.id === id);
  if (!lossDoc) return alert("Perte introuvable.");

  // Restituer le stock
  const data = lossDoc.data();
  const stockSnap = await getDocs(stockCollection);
  const productDoc = stockSnap.docs.find(d => d.data().productName === data.productName);
  if (productDoc) {
    const currentQty = productDoc.data().quantity;
    await updateDoc(doc(db, 'stock', productDoc.id), { quantity: currentQty + data.quantity });
  }

  await deleteDoc(docRef);

  // Supprimer entrée correspondante dans losses si existante
  const lossesSnap = await getDocs(lossesCollection);
  const linkedLoss = lossesSnap.docs.find(d => d.data().historyId === id);
  if (linkedLoss) await deleteDoc(doc(db, 'losses', linkedLoss.id));

  loadLosses();
};

// --- Init ---
loadLosses();