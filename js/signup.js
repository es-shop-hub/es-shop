// signup.js
import { 
  db, doc, Timestamp 
} from './firebase.js';

import { setDoc, getAuth, createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();

const signupForm = document.getElementById('signupForm');

// --- SIGNUP ---
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  if (!fullName || !email || !password) {
    alert("Remplis tous les champs");
    return;
  }

  try {
    // 🔐 1. CREATE AUTH USER
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // 🧠 2. CREATE FIRESTORE USER (ID = UID)
    await setDoc(doc(db, "users", uid), {
      userId: uid, // optionnel mais utile
      fullName,
      email,
      role: "user", // sécurité anti infiltration
      isActive: true,
      createdAt: Timestamp.now()
    });

    alert("Compte créé !");

    // 🚀 3. REDIRECTION PROPRE
    window.location.replace("login.html");

  } catch (err) {
    console.error(err);

    if (err.code === "auth/email-already-in-use") {
      alert("Email déjà utilisé");
    } else if (err.code === "auth/weak-password") {
      alert("Mot de passe trop faible");
    } else if (err.code === "auth/network-request-failed") {
      alert("Problème de connexion internet");
    } else {
      alert("Erreur création compte");
    }
  }
});
