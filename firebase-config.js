// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC4AwYNuLyNwezSJ_UV8sfUoNkbHU49Xug",
  authDomain: "sarlabg.firebaseapp.com",
  projectId: "sarlabg",
  storageBucket: "sarlabg.firebasestorage.app",
  messagingSenderId: "342574513911",
  appId: "1:342574513911:web:09a0d1f6b9469b04591df2",
  measurementId: "G-G96NCYVHEF"
};

// Inicializamos la app
const app = initializeApp(firebaseConfig);

// Exportamos los servicios para usarlos en los otros scripts
export const db = getFirestore(app);
export const auth = getAuth(app);
