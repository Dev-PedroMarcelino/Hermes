import axios from 'axios';

/**
 * Client for the Hermes engine API.
 *
 * The dashboard no longer writes production statuses into Firestore directly —
 * it asks the engine to queue a job and then watches the job document update in
 * real time. Firestore stays the read model; the engine owns all writes to the
 * production pipeline.
 */

const BASE_URL = (import.meta.env.VITE_ENGINE_URL || 'http://localhost:3001').replace(/\/$/, '');
const API_KEY = import.meta.env.VITE_ENGINE_API_KEY || '';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

client.interceptors.request.use(config => {
  if (API_KEY) config.headers['x-api-key'] = API_KEY;
  return config;
});

/** Turns an axios failure into a message worth showing a human. */
function toReadableError(error) {
  if (error.response?.data?.error) return new Error(error.response.data.error);
  if (error.code === 'ERR_NETWORK') {
    return new Error(
      `Não foi possível falar com o motor em ${BASE_URL}. Ele está rodando? (npm run engine)`
    );
  }
  return new Error(error.message || 'Erro desconhecido ao chamar o motor.');
}

export const engineBaseUrl = BASE_URL;
export const engineApiKeyConfigured = Boolean(API_KEY);

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
