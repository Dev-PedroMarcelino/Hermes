import admin from 'firebase-admin';
import { config } from './env.js';

if (!admin.apps.length) {
  const { projectId, clientEmail, privateKey, storageBucket } = config.firebase;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket
    });
  } else {
    throw new Error(
      'Credenciais do Firebase Admin ausentes. Defina FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY no .env.'
    );
  }
}

export const db = admin.firestore();
export const storage = admin.storage();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;
