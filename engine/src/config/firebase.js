import admin from 'firebase-admin';
import { config } from './env.js';

if (!admin.apps.length) {
  if (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey
      }),
      storageBucket: config.firebase.storageBucket
    });
  } else {
    // Fallback initialize for dev / emulator
    admin.initializeApp({
      projectId: 'hermes-dev'
    });
  }
}

export const db = admin.firestore();
export const storage = admin.storage();
