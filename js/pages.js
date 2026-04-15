import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { db, collection, getDocs } from "./firebase.js";

/* ================================
   AUTH + ROLE CONTROL
================================ */
const auth = getAuth();

const blockedScreen = document.getElementById("blocked");
const grid = document.getElementById("pages-grid");

/* ================================
   REDIRECT SAFE
================================ */
function go(page) {
  if (!page) return;
  window.location.href = page;
}

/* ================================
   HIDE ALL ON BLOCK
================================ */
function blockAccess() {
  document.body.innerHTML = "";
  document.body.style.background = "black";

  const div = document.createElement("div");
  div.style.color = "white";
  div.style.display = "flex";
  div.style.height = "100vh";
  div.style.alignItems = "center";
  div.style.justifyContent = "center";
  div.style.fontSize = "20px";
  div.innerText = "⛔ Accès refusé";

  document.body.appendChild(div);
}

/* ================================
   GET USER ROLE
================================ */
async function getUserRole(uid) {
  const snap = await getDocs(collection(db, "users"));

  const me = snap.docs.find(d => d.id === uid);
  if (!me) return null;

  return me.data().role;
}

/* ================================
   INIT SYSTEM
================================ */
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    blockAccess();
    return;
  }

  const role = await getUserRole(user.uid);

  if (!role || (role !== "admin" && role !== "seller")) {
    blockAccess();
    return;
  }

  /* ================================
     ENABLE NAV ONLY IF AUTHORIZED
  ================================= */
  document.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => {
      const page = card.dataset.page;
      go(page);
    });
  });

});