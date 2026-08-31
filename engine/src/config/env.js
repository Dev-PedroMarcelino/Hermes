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
    .map(item => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const projectRoot = path.resolve(__dirname, '../../..');

export const config = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  enginePublicUrl: (process.env.ENGINE_PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, ''),
  dashboardUrl: (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, ''),
  allowedOrigins: splitList(process.env.ALLOWED_ORIGINS).length
    ? splitList(process.env.ALLOWED_ORIGINS)
    : ['http://localhost:3000', 'http://localhost:5173'],
  /**
   * Vercel gives every preview deploy a fresh subdomain, so they cannot be
   * enumerated in ALLOWED_ORIGINS. Set this to your project prefix (e.g.
   * "hermes") to also accept https://hermes-*.vercel.app.
   */
  vercelPreviewPrefix: process.env.VERCEL_PREVIEW_PREFIX || '',
  /** Emails or UIDs allowed to operate the engine (Firebase Auth). */
  allowedOperators: splitList(process.env.ALLOWED_OPERATORS),
  /**
   * Whether the API process should also run the production worker.
   * Free hosting tiers usually do not offer a separate background-worker
   * service, so co-hosting keeps the factory running at no cost.
   */
  runWorkerInProcess: process.env.ENABLE_WORKER !== 'false',
  /**
   * How Instagram gets a downloadable HTTPS URL for the rendered video:
   * 'engine' (free, served by this process) or 'storage' (Firebase Cloud
   * Storage, which needs the paid Blaze plan).
   */
  publicVideoStrategy: process.env.PUBLIC_VIDEO_STRATEGY === 'storage' ? 'storage' : 'engine',
  /**
   * Writable paths. Hosts like Render give the container an ephemeral disk, and
   * resolving these against process.cwd() made the output location depend on
   * which directory npm was invoked from.
   */
  paths: {
    output: process.env.OUTPUT_DIR
      ? path.resolve(process.env.OUTPUT_DIR)
      : path.join(projectRoot, 'output', 'videos'),
    temp: process.env.TEMP_DIR
      ? path.resolve(process.env.TEMP_DIR)
      : path.join(projectRoot, 'tmp_jobs')
  },
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  pexelsApiKey: process.env.PEXELS_API_KEY || '',
  serperApiKey: process.env.SERPER_API_KEY || '',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY || '',
  googleSearchCx: process.env.GOOGLE_SEARCH_CX || '',
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
 * Decides whether a browser Origin may call this engine.
 */
export function isOriginAllowed(origin) {
  if (!origin) return false;
  if (config.allowedOrigins.includes(origin)) return true;

  // Allow localhost for local development
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;

  // Allow all Vercel domains for dashboard deployments (e.g. hermes-lake-phi.vercel.app)
  if (/^https:\/\/[a-z0-9-_.]+\.vercel\.app$/i.test(origin)) return true;

  if (config.vercelPreviewPrefix) {
    const previewPattern = new RegExp(
      `^https://${config.vercelPreviewPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]*\\.vercel\\.app$`
    );
    return previewPattern.test(origin);
  }

  return false;
}

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
