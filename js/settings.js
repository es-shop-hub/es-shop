import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from './firebase.js';

// --- VÉRIFICATION RÔLE ADMIN ---
const currentUserRole = localStorage.getItem('userRole'); // ex: stocké au login
const currentUserId = localStorage.getItem('userId'); // pour éviter auto-suppression
if (!['master', 'admin'].includes(currentUserRole)) {
  alert("Accès refusé : réservé aux administrateurs.");
  document.body.innerHTML = "<h1>Accès refusé</h1>";
  throw new Error("Non-admin tenté d'accéder à settings");
}

// --- COLLECTIONS ---
const usersCollection = collection(db, 'users');
const systemConfigDoc = doc(db, 'system', 'config');

// --- DOM ---
const usersTableBody = document.querySelector('#usersTable tbody');
const addUserBtn = document.getElementById('addUserBtn');
const addUserModal = document.getElementById('addUserModal');
const saveUserBtn = document.getElementById('saveUserBtn');
const cancelUserBtn = document.getElementById('cancelUserBtn');
const newUserName = document.getElementById('newUserName');
const newUserEmail = document.getElementById('newUserEmail');
const newUserRole = document.getElementById('newUserRole');
const alertsToggle = document.getElementById('alertsToggle');
const systemLockToggle = document.getElementById('systemLockToggle');

// --- LOAD USERS ---
async function loadUsers() {
  usersTableBody.innerHTML = '';
  const snapshot = await getDocs(usersCollection);
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const tr = document.createElement('tr');

    // Actions : seul un master peut changer rôle
    let roleActions = `<button onclick="editUser('${docSnap.id}')">Modifier</button>`;
    if (currentUserRole === 'master' && docSnap.id !== currentUserId) {
      roleActions += `<button onclick="deleteUser('${docSnap.id}')">Supprimer</button>`;
    }

    tr.innerHTML = `
      <td>${data.name}</td>
      <td>${data.email}</td>
      <td>${data.role}</td>
      <td>${roleActions}</td>
    `;
    usersTableBody.appendChild(tr);
  });
}

// --- AJOUT UTILISATEUR ---
addUserBtn.addEventListener('click', () => addUserModal.style.display = 'flex');
cancelUserBtn.addEventListener('click', () => addUserModal.style.display = 'none');

saveUserBtn.addEventListener('click', async () => {
  const name = newUserName.value.trim();
  const email = newUserEmail.value.trim();
  let role = newUserRole.value;

  if (!name || !email) return alert("Nom et email requis.");

  // Seul master peut créer admin
  if (role === 'master' && currentUserRole !== 'master') role = 'seller';

  await addDoc(usersCollection, {
    name,
    email,
    role,
    createdAt: serverTimestamp()
  });

  newUserName.value = '';
  newUserEmail.value = '';
  newUserRole.value = 'seller';
  addUserModal.style.display = 'none';
  loadUsers();
});

// --- MODIFIER UTILISATEUR ---
window.editUser = async (id) => {
  if (id === currentUserId) return alert("Impossible de modifier votre propre rôle ici.");

  const snapshot = await getDocs(usersCollection);
  const userDoc = snapshot.docs.find(d => d.id === id);
  if (!userDoc) return;
  const data = userDoc.data();

  const newName = prompt("Nom :", data.name);
  const newEmail = prompt("Email :", data.email);

  let newRole = data.role;
  if (currentUserRole === 'master') {
    newRole = prompt("Rôle (master/admin/seller) :", data.role);
    if (!['master','admin','seller'].includes(newRole)) {
      alert("Rôle invalide, modification annulée.");
      return;
    }
  }

  if (!newName || !newEmail) return;

  await updateDoc(doc(db, 'users', id), {
    name: newName,
    email: newEmail,
    role: newRole
  });
  loadUsers();
};

// --- SUPPRIMER UTILISATEUR ---
window.deleteUser = async (id) => {
  if (id === currentUserId) return alert("Impossible de supprimer votre propre compte.");
  if (!confirm("Supprimer cet utilisateur définitivement ?")) return;
  await deleteDoc(doc(db, 'users', id));
  loadUsers();
};

// --- CONFIG SYSTEME ---
async function loadSystemConfig() {
  const snap = await getDocs(collection(db, 'system'));
  const config = snap.docs.find(d => d.id === 'config');
  if (config) {
    const data = config.data();
    alertsToggle.checked = data.alertsEnabled || false;
    systemLockToggle.checked = data.systemLocked || false;
  }
}

alertsToggle.addEventListener('change', async () => {
  await updateDoc(systemConfigDoc, { alertsEnabled: alertsToggle.checked });
});

systemLockToggle.addEventListener('change', async () => {
  await updateDoc(systemConfigDoc, { systemLocked: systemLockToggle.checked });
});

// --- INIT ---
loadUsers();
loadSystemConfig();