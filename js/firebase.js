// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  getDoc, query, where, serverTimestamp, Timestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8_86DgCqPdwVNy1ww6PPz0TM5lVMWm_s",
  authDomain: "es-shop-db.firebaseapp.com",
  projectId: "es-shop-db",
  storageBucket: "es-shop-db.firebasestorage.app",
  messagingSenderId: "750093706451",
  appId: "1:750093706451:web:62f0aa0891d0ed0ed96026",
  measurementId: "G-TM3YYR5ZH7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { 
  db, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, getDoc,
  query, where, serverTimestamp, Timestamp, enableIndexedDbPersistence
};