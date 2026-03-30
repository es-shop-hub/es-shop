// signup.js
import { 
  db, collection, addDoc, Timestamp 
} from './firebase.js';

import { 
  getAuth, createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const auth = getAuth();

const signupForm = document.getElementById('signupForm');
const usersCollection = collection(db, 'users');

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
    // 🔥 1. CREATE AUTH USER
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 🔥 2. CREATE FIRESTORE USER
    await addDoc(usersCollection, {
      userId: user.uid, // lien avec auth
      fullName,
      email,
      role: "user", // sécurité anti infiltration
      isActive: true,
      createdAt: Timestamp.now()
    });

    alert("Compte créé !");
    
    // 🔥 3. REDIRECT LOGIN
    window.location.href = "login.html";

  } catch (err) {
    console.error(err);

    if (err.code === "auth/email-already-in-use") {
      alert("Email déjà utilisé");
    } else if (err.code === "auth/weak-password") {
      alert("Mot de passe trop faible");
    } else {
      alert("Erreur création compte");
    }
  }
});
