import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUg9wKDz0kb_rAABLMFXM7LXS7WS18hwY",
  authDomain: "sarp-40571.firebaseapp.com",
  projectId: "sarp-40571",
  storageBucket: "sarp-40571.firebasestorage.app",
  messagingSenderId: "457540042625",
  appId: "1:457540042625:web:68fd49fc2428595afd7280",
  measurementId: "G-MHZQJED827"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
