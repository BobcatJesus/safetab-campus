import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBFiNn7uV1htkh-Ua0pyHyiO38YYke73bU",
  authDomain: "venue-safety-app.firebaseapp.com",
  databaseURL: "https://venue-safety-app-default-rtdb.firebaseio.com",
  projectId: "venue-safety-app",
  storageBucket: "venue-safety-app.firebasestorage.app",
  messagingSenderId: "990966232221",
  appId: "1:990966232221:web:560925516b164aa504d074",
  measurementId: "G-0JG7NCXDP9",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
