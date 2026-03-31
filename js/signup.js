// signup.js
import { db, doc, setDoc, Timestamp } from './firebase.js'; // Firestore
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js"; // Auth

const auth = getAuth();
const signupForm = document.getElementById('signupForm');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // --- Récupérer les champs du formulaire
  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const isActive = document.getElementById('isActive').checked; // ✅ récupère le checkbox

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
      userId: uid,
      fullName,
      email,
      role: "user", // sécurité
      isActive,     // ✅ checkbox pris en compte
      createdAt: Timestamp.now()
    });

    alert("Compte créé !");
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
