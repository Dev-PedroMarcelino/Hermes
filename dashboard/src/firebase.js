import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * These values are public by design — the Firebase Web SDK ships them in the
 * bundle and access is controlled by Firestore Security Rules plus Firebase
 * Auth, not by hiding the config.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  // Failing loudly beats the confusing runtime errors that follow a partially
  // configured Firebase app.
  console.error(
    `[Firebase] Configuração incompleta. Defina no .env da dashboard: ${missing
      .map(k => `VITE_FIREBASE_${k.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()}`)
      .join(', ')}`
  );
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
});
export const auth = getAuth(app);

