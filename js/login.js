// login.js
import { db, doc, getDoc, addDoc, collection, Timestamp } from './firebase.js';

import { 
  signInWithEmailAndPassword, 
  getAuth, 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('rememberMe');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    alert("Remplis tous les champs");
    return;
  }

  try {
    // 🔐 Persistence
    await setPersistence(
      auth,
      rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence
    );

    // 🔐 AUTH LOGIN
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // 🧠 FIRESTORE CHECK (ID = UID)
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      alert("Utilisateur non configuré");
      return;
    }

    const userData = userSnap.data();

    if (!userData.isActive) {
      alert("Compte désactivé");
      return;
    }

    if (!["admin", "seller", "user"].includes(userData.role)) {
      alert("Accès refusé");
      return;
    }

    // 💾 STOCK LOCAL (ton app dépend de ça)
    localStorage.setItem("userId", uid);
    localStorage.setItem("userRole", userData.role);

    // 📜 LOG (optionnel mais propre)
    await addDoc(collection(db, "logs"), {
      userId: uid,
      action: "login",
      role: userData.role,
      createdAt: Timestamp.now()
    });

    // 🚀 REDIRECTION PROPRE
    window.location.replace("index.html");

  } catch (err) {
    console.error(err);

    if (err.code === "auth/user-not-found") {
      alert("Utilisateur introuvable");
    } else if (err.code === "auth/wrong-password") {
      alert("Mot de passe incorrect");
    } else if (err.code === "auth/invalid-email") {
      alert("Email invalide");
    } else if (err.code === "auth/network-request-failed") {
      alert("Pas de connexion internet");
    } else {
      alert("Erreur de connexion");
    }
  }
});
