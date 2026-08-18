import admin from 'firebase-admin';
import { config } from './env.js';

/**
 * Firebase Admin bootstrap.
 *
 * This deliberately does NOT throw on failure. Throwing here killed the process
 * during module import — before Express could bind a port — so a misconfigured
 * key produced ERR_CONNECTION_REFUSED in the browser with no way to inspect the
 * cause remotely. The engine now boots either way and reports the problem
 * through /health, which is often the only channel available when a deploy is
 * broken.
 */

/** @type {{ok: boolean, error: string|null, hint: string|null}} */
export const firebaseStatus = { ok: false, error: null, hint: null };

/**
 * Points at the mistakes that actually happen when moving a service account into
 * a hosting panel, instead of a generic "invalid credential".
 */
function diagnosePrivateKey(privateKey) {
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    return 'FIREBASE_PRIVATE_KEY não contém "-----BEGIN PRIVATE KEY-----". Cole a chave inteira.';
  }
  if (!privateKey.includes('\n')) {
    return 'FIREBASE_PRIVATE_KEY está numa única linha. Ela precisa das quebras de linha reais, ou dos "\\n" literais que o motor converte.';
  }
  return null;
}

let db = null;
let storage = null;
let auth = null;
let FieldValue = null;

try {
  const { projectId, clientEmail, privateKey, storageBucket } = config.firebase;

  const missing = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY'
  ].filter(Boolean);

  if (missing.length > 0) throw new Error(`Variáveis ausentes: ${missing.join(', ')}.`);

  const keyProblem = diagnosePrivateKey(privateKey);
  if (keyProblem) throw new Error(keyProblem);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket
    });
  }

  db = admin.firestore();
  storage = admin.storage();
  auth = admin.auth();
  FieldValue = admin.firestore.FieldValue;

  firebaseStatus.ok = true;
} catch (err) {
  firebaseStatus.error = err.message;
  firebaseStatus.hint =
    'O motor está no ar, mas sem banco: nenhuma rota que usa Firestore vai funcionar. ' +
    'Corrija as variáveis FIREBASE_* e reinicie.';

  console.error('=======================================================');
  console.error('❌ Firebase Admin NÃO inicializou');
  console.error(`   ${err.message}`);
  console.error(`   ${firebaseStatus.hint}`);
  console.error('=======================================================');
}

export { db, storage, auth, FieldValue };
