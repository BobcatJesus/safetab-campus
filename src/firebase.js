import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDLvJypejR7lH2NoqpNIOyGO1X-qjaFy5s",
  authDomain: "sidetabbobcatjesus.firebaseapp.com",
  databaseURL: "https://sidetabbobcatjesus-default-rtdb.firebaseio.com",
  projectId: "sidetabbobcatjesus",
  storageBucket: "sidetabbobcatjesus.firebasestorage.app",
  messagingSenderId: "563794751706",
  appId: "1:563794751706:web:58225cec2d48c29691b5e3"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

export const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => {
    if (user) resolve(user);
    else signInAnonymously(auth).catch(() => resolve(null));
  });
});
