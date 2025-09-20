// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCyFuGzuczVp9xzN61mFn1WYVSwlfGXpCY",
  authDomain: "enem-planner.firebaseapp.com",
  projectId: "enem-planner",
  storageBucket: "enem-planner.firebasestorage.app",
  messagingSenderId: "638304430015",
  appId: "1:638304430015:web:a9512ac1bbd6a340bea30a",
  measurementId: "G-XHTDR9L8D5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics: Analytics | null = null;

if (typeof window !== 'undefined') {
  void isAnalyticsSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    analytics = null;
  });
}
const db = getFirestore(app);
const auth = getAuth(app);

// Anonymous authentication function
export const authenticateAnonymously = async (): Promise<void> => {
  try {
    await signInAnonymously(auth);
    console.log('Authenticated anonymously');
  } catch (error) {
    console.error('Anonymous authentication failed:', error);
  }
};

// Auth state change listener
export const onAuthChange = (callback: (user: any) => void): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return !!auth.currentUser;
};

export { app, analytics, db, auth };
