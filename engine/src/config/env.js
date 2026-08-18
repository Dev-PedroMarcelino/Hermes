import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The .env lives at the repository root, one level above /engine
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function splitList(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  engineApiKey: process.env.ENGINE_API_KEY || '',
  enginePublicUrl: (process.env.ENGINE_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, ''),
  dashboardUrl: (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, ''),
  allowedOrigins: splitList(process.env.ALLOWED_ORIGINS) .length
    ? splitList(process.env.ALLOWED_ORIGINS)
    : ['http://localhost:3000', 'http://localhost:5173'],
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  pexelsApiKey: process.env.PEXELS_API_KEY || '',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n')
      : '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || ''
  },
  oauth: {
    youtube: {
      clientId: process.env.YOUTUBE_CLIENT_ID || '',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || ''
    },
    tiktok: {
      clientKey: process.env.TIKTOK_CLIENT_KEY || '',
      clientSecret: process.env.TIKTOK_CLIENT_SECRET || ''
    },
    instagram: {
      appId: process.env.INSTAGRAM_APP_ID || '',
      appSecret: process.env.INSTAGRAM_APP_SECRET || ''
    }
  }
};

/**
 * The vault derives its AES key from ENCRYPTION_KEY. If that value ever changes,
 * every stored credential becomes undecryptable, so we fail loudly instead of
 * silently falling back to a shared default.
 */
export function assertEncryptionKey() {
  if (!config.encryptionKey || config.encryptionKey.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY ausente ou muito curta no .env. Defina uma string aleatória de 32+ caracteres antes de armazenar credenciais.'
    );
  }
}
