// login.js
import { db, collection, doc, getDoc } from './firebase.js';
import { signInWithEmailAndPassword, getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const auth = getAuth();

// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('rememberMe');

// ID utilisateur courant (sera défini après login)
let currentUserId = null;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) return alert("Veuillez remplir tous les champs !");

  try {
    // Définir la persistance en fonction du checkbox
    await setPersistence(auth, rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence);

    // Connexion Firebase
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    currentUserId = userCredential.user.uid;

    // Vérification rôle depuis Firestore
    const userDoc = await getDoc(doc(db, "users", currentUserId));
    if (!userDoc.exists()) {
      alert("Utilisateur inconnu !");
      return;
    }

    const userData = userDoc.data();

    if (!userData.isActive) {
      alert("Compte désactivé !");
      return;
    }

    // Rôle autorisé: admin, seller, user
    if (!["admin", "seller", "user"].includes(userData.role)) {
      alert("Accès refusé !");
      return;
    }

    // Log connexion (sécurisé)
    await addDoc(collection(db, "logs"), {
      userId: currentUserId,
      action: "login",
      role: userData.role,
      timestamp: new Date()
    });

    alert("Connexion réussie !");
    // Redirige vers index.html après login
    window.location.href = "index.html";

  } catch (err) {
    console.error("Erreur login:", err);
    alert("Email ou mot de passe incorrect !");
  }
});