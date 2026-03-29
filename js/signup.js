// signup.js
import { db, collection, addDoc, getDocs, query, where, Timestamp } from './firebase.js';

const signupForm = document.getElementById('signupForm');
const usersCollection = collection(db, 'users');
const logsCollection = collection(db, 'logs');

// Fonction pour vérifier si email existe déjà
async function isEmailTaken(email) {
  const q = query(usersCollection, where('email', '==', email));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

// Créer un nouvel utilisateur
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const roleInput = document.getElementById('role');
  const isActive = document.getElementById('isActive').checked;

  if (!fullName || !email || !password) {
    alert("Veuillez remplir tous les champs !");
    return;
  }

  try {
    // Vérifier email
    if (await isEmailTaken(email)) {
      alert("Cet email est déjà utilisé !");
      return;
    }

    // Rôle par défaut pour éviter infiltration
    const role = "user"; // jamais admin/seller côté signup public

    // Création utilisateur
    const userRef = await addDoc(usersCollection, {
      fullName,
      email,
      password, // Si tu veux plus pro, hacher côté serveur/Firebase function
      role,
      isActive,
      createdAt: Timestamp.now()
    });

    // Log admin-only (ici simulé : si un admin est connecté)
    // const currentAdminId = ... récupérer depuis auth ou context
    // await addDoc(logsCollection, { userId: currentAdminId, action: 'create_user', targetId: userRef.id, createdAt: Timestamp.now() });

    alert("Utilisateur créé avec succès !");
    signupForm.reset();

    // Redirection vers login
    window.location.href = "login.html";

  } catch (err) {
    console.error("Erreur lors de la création utilisateur:", err);
    alert("Erreur lors de la création de l'utilisateur !");
  }
});