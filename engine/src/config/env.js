import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionKey: process.env.ENCRYPTION_KEY || 'hermes_default_secret_32_bytes!!', // 32 characters
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  pexelsApiKey: process.env.PEXELS_API_KEY || '',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || ''
  }
};
