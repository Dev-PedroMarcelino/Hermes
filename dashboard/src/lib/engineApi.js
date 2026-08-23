import axios from 'axios';
import { auth } from '../firebase';

/**
 * Client for the Hermes engine API.
 *
 * The dashboard no longer writes production statuses into Firestore directly —
 * it asks the engine to queue a job and then watches the job document update in
 * real time. Firestore stays the read model; the engine owns all writes to the
 * production pipeline.
 *
 * Requests carry a Firebase Auth ID token. An API key was used here before, but
 * Vite inlines every VITE_* value into the shipped bundle, so on a public deploy
 * that key is readable by anyone — and it was enough to publish to the connected
 * channels. ID tokens are short-lived, per-user, and verified server-side.
 */

const BASE_URL = (import.meta.env.VITE_ENGINE_URL || 'http://localhost:3001').replace(/\/$/, '');

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

client.interceptors.request.use(async requestConfig => {
  const user = auth.currentUser;
  if (user) {
    // getIdToken refreshes automatically when the current token is near expiry
    requestConfig.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  return requestConfig;
});

/** Turns an axios failure into a message worth showing a human. */
function toReadableError(error) {
  if (error.response?.status === 401) {
    return new Error(error.response.data?.error || 'Sessão expirada. Faça login novamente.');
  }
  if (error.response?.status === 403) {
    return new Error(
      error.response.data?.error ||
        'Esta conta não está autorizada. Adicione o e-mail em ALLOWED_OPERATORS no motor.'
    );
  }
  if (error.response?.data?.error) return new Error(error.response.data.error);
  if (error.code === 'ERR_NETWORK') {
    return new Error(`Não foi possível falar com o motor em ${BASE_URL}. Ele está online?`);
  }
  return new Error(error.message || 'Erro desconhecido ao chamar o motor.');
}

export const engineBaseUrl = BASE_URL;

/** Engine health plus which networks have credentials configured. */
export async function getEngineHealth() {
  try {
    const { data } = await client.get('/health');
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Queues a real production job.
 * @returns {Promise<{jobId: string, status: string}>}
 */
export async function triggerVideoJob({ tenantId, customTopic, customInstruction }) {
  try {
    const { data } = await client.post('/api/jobs/trigger', {
      tenantId,
      customTopic: customTopic || null,
      customInstruction: customInstruction || null
    });
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Gets the provider consent URL to open in a popup.
 * @param {'youtube'|'tiktok'|'instagram'} network
 */
export async function startOAuthConnection({ network, tenantId }) {
  try {
    const { data } = await client.get(`/api/oauth/${network}/start`, { params: { tenantId } });
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

export async function disconnectNetwork({ network, tenantId }) {
  try {
    const { data } = await client.delete(`/api/oauth/${network}/connection`, { params: { tenantId } });
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Reports, per network, whether this channel uses its own app or the shared
 * one from the engine's .env. Never returns secrets.
 */
export async function getAppCredentialsStatus(tenantId) {
  try {
    const { data } = await client.get(`/api/tenants/${tenantId}/app-credentials`);
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Registers this channel's own application credentials (its own Google Cloud
 * project / TikTok app / Meta app), which gives it a private API quota.
 * Sending empty values clears the override and falls back to the shared app.
 */
export async function saveAppCredentials({ tenantId, network, credentials }) {
  try {
    const { data } = await client.post(
      `/api/tenants/${tenantId}/app-credentials/${network}`,
      credentials
    );
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/** Stores a tenant's own API keys, encrypted server-side. */
export async function saveTenantCredentials({ tenantId, geminiApiKey, pexelsApiKey }) {
  try {
    const { data } = await client.post('/api/vault/credentials', { tenantId, geminiApiKey, pexelsApiKey });
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Generates script scenes with Gemini and brings visual image choices for each scene.
 *
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {string} [options.topic]
 * @param {string} [options.instruction]
 * @param {string} [options.mediaPreference='auto']
 */
export async function generateImagePreview({ tenantId, topic, instruction, mediaPreference = 'auto' }) {
  try {
    const { data } = await client.post('/api/preview/images', {
      tenantId,
      topic: topic || null,
      instruction: instruction || null,
      mediaPreference
    });
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Searches / regenerates candidate images for a single scene on the fly.
 *
 * @param {Object} options
 * @param {string} options.query
 * @param {string} [options.prompt]
 * @param {string} [options.source='google_image']
 * @param {string} [options.tenantId]
 */
export async function searchSingleImage({ query, prompt, source, tenantId }) {
  try {
    const { data } = await client.post('/api/preview/single-image', {
      query,
      prompt,
      source,
      tenantId
    });
    return data;
  } catch (error) {
    throw toReadableError(error);
  }
}

/**
 * Gets a proxied URL for external images that might fail with strict CORS / Referrer policies.
 * @param {string} url
 */
export function getProxyImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('https://image.pollinations.ai')) return url;
  if (url.startsWith('https://images.pexels.com')) return url;
  return `${BASE_URL}/api/preview/proxy-image?url=${encodeURIComponent(url)}`;
}

