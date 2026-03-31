import { db, doc, setDoc, Timestamp } from './firebase.js';

import {
  getAuth,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();

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
    // 🔐 1. Création Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // 🧠 2. Création Firestore avec UID = ID
    await setDoc(doc(db, "users", uid), {
      name: fullName,
      email,
      role: "user",
      isActive: true,
      createdAt: Timestamp.now()
    });

    alert("Compte créé !");
    window.location.href = "login.html";

  } catch (err) {
    console.error(err);

    if (err.code === "auth/email-already-in-use") {
      alert("Email déjà utilisé");
    } else {
      alert("Erreur création compte");
    }
  }
});
