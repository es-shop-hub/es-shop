// login.js
import { db, collection, doc, getDoc, addDoc, Timestamp } from './firebase.js';

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

    // 🔐 Login Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // 🔎 Get Firestore user (ID = UID)
    const userDoc = await getDoc(doc(db, "users", uid));

    if (!userDoc.exists()) {
      alert("Utilisateur non configuré !");
      return;
    }

    const userData = userDoc.data();

    if (!userData.isActive) {
      alert("Compte désactivé");
      return;
    }

    if (!["admin", "seller", "user"].includes(userData.role)) {
      alert("Accès refusé");
      return;
    }

    // 🧠 Stock local (utile pour ton app)
    localStorage.setItem("userId", uid);
    localStorage.setItem("userRole", userData.role);

    // 📜 Log
    await addDoc(collection(db, "logs"), {
      userId: uid,
      action: "login",
      role: userData.role,
      createdAt: Timestamp.now()
    });

    // 🚀 REDIRECTION PROPRE (sans alert)
    window.location.replace("index.html");

  } catch (err) {
    console.error(err);

    if (err.code === "auth/user-not-found") {
      alert("Utilisateur introuvable");
    } else if (err.code === "auth/wrong-password") {
      alert("Mot de passe incorrect");
    } else {
      alert("Erreur de connexion");
    }
  }
});
