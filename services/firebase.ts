import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCyFuGzuczVp9xzN61mFn1WYVSwlfGXpCY',
  authDomain: 'enem-planner.firebaseapp.com',
  projectId: 'enem-planner',
  storageBucket: 'enem-planner.firebasestorage.app',
  messagingSenderId: '638304430015',
  appId: '1:638304430015:web:a9512ac1bbd6a340bea30a',
  measurementId: 'G-XHTDR9L8D5'
};

const app = initializeApp(firebaseConfig);
let analytics: Analytics | null = null;

if (typeof window !== 'undefined') {
  void isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}

const db = getFirestore(app);
const auth = getAuth(app);

// Anonymous authentication removed - users must login with email/password

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => onAuthStateChanged(auth, callback);

export const getCurrentUser = (): User | null => auth.currentUser;

export const registerWithEmail = async (email: string, password: string): Promise<User | null> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const signInWithEmail = async (email: string, password: string): Promise<User | null> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const signOutUser = async (): Promise<void> => {
  await signOut(auth);
};

export { app, analytics, db, auth };
