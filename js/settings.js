// settings.js
import { 
  db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp 
} from './firebase.js';

import { 
  getAuth, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();

// --- GLOBAL USER ---
let currentUserId = null;
let currentUserRole = null;

// --- COLLECTIONS ---
const usersCollection = collection(db, 'users');
const systemConfigRef = doc(db, 'system', 'config');

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

// --- AUTH CHECK ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Non connecté");
    window.location.href = "login.html";
    return;
  }

  currentUserId = user.uid;

  const userDoc = await getDoc(doc(db, "users", user.uid));

  if (!userDoc.exists()) {
    alert("Utilisateur non configuré");
    return;
  }

  const data = userDoc.data();
  currentUserRole = data.role;

  if (!["admin", "master"].includes(currentUserRole)) {
    alert("Accès refusé");
    document.body.innerHTML = "<h1>Accès refusé</h1>";
    return;
  }

  // INIT
  loadUsers();
  loadSystemConfig();
});

// --- LOAD USERS ---
async function loadUsers() {
  usersTableBody.innerHTML = '';

  const snapshot = await getDocs(usersCollection);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const userId = docSnap.id;

    const tr = document.createElement('tr');

    let actions = `<button onclick="editUser('${userId}')">Modifier</button>`;

    if (currentUserRole === 'master' && userId !== currentUserId) {
      actions += `<button onclick="deleteUser('${userId}')">Supprimer</button>`;
    }

    tr.innerHTML = `
      <td>${data.fullName || data.name || '-'}</td>
      <td>${data.email}</td>
      <td>${data.role}</td>
      <td>${actions}</td>
    `;

    usersTableBody.appendChild(tr);
  });
}

// --- ADD USER (Firestore only, NOT Auth) ---
addUserBtn.addEventListener('click', () => {
  addUserModal.style.display = 'flex';
});

cancelUserBtn.addEventListener('click', () => {
  addUserModal.style.display = 'none';
});

saveUserBtn.addEventListener('click', async () => {
  const name = newUserName.value.trim();
  const email = newUserEmail.value.trim();
  let role = newUserRole.value;

  if (!name || !email) return alert("Nom et email requis");

  if (role === "master" && currentUserRole !== "master") {
    role = "seller";
  }

  const ref = await addDoc(usersCollection, {
    fullName: name,
    email,
    role,
    isActive: true,
    createdAt: serverTimestamp()
  });

  // LOG
  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "create_user_firestore",
    targetId: ref.id,
    createdAt: serverTimestamp()
  });

  addUserModal.style.display = 'none';
  loadUsers();
});

// --- EDIT USER ---
window.editUser = async (id) => {
  if (id === currentUserId) {
    alert("Impossible de modifier ton propre rôle ici");
    return;
  }

  const userRef = doc(db, "users", id);
  const snap = await getDoc(userRef);

  if (!snap.exists()) return;

  const data = snap.data();

  const newName = prompt("Nom :", data.fullName || data.name);
  const newEmail = prompt("Email :", data.email);

  let newRole = data.role;

  if (currentUserRole === "master") {
    newRole = prompt("Rôle (master/admin/seller/user) :", data.role);
  }

  if (!newName || !newEmail) return;

  await updateDoc(userRef, {
    fullName: newName,
    email: newEmail,
    role: newRole,
    updatedAt: serverTimestamp()
  });

  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "edit_user",
    targetId: id,
    createdAt: serverTimestamp()
  });

  loadUsers();
};

// --- DELETE USER (Firestore only) ---
window.deleteUser = async (id) => {
  if (id === currentUserId) {
    alert("Impossible de supprimer ton propre compte");
    return;
  }

  if (!confirm("Supprimer cet utilisateur ?")) return;

  await deleteDoc(doc(db, "users", id));

  await addDoc(collection(db, "logs"), {
    userId: currentUserId,
    action: "delete_user",
    targetId: id,
    createdAt: serverTimestamp()
  });

  loadUsers();
};

// --- SYSTEM CONFIG ---
async function loadSystemConfig() {
  const snap = await getDoc(systemConfigRef);

  if (snap.exists()) {
    const data = snap.data();
    alertsToggle.checked = data.alertsEnabled || false;
    systemLockToggle.checked = data.systemLocked || false;
  }
}

alertsToggle.addEventListener('change', async () => {
  await updateDoc(systemConfigRef, {
    alertsEnabled: alertsToggle.checked
  });
});

systemLockToggle.addEventListener('change', async () => {
  await updateDoc(systemConfigRef, {
    systemLocked: systemLockToggle.checked
  });
});
