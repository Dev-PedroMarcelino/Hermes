import express from 'express';
import { config } from './config/env.js';
import { db } from './config/firebase.js';
import { runPreflight } from './config/preflight.js';
import { executeVideoPipeline, JOB_STATUS } from './services/pipelineOrchestrator.js';
import { encryptCredential } from './services/vaultService.js';
import {
  SUPPORTED_NETWORKS,
  buildAuthUrl,
  consumeOAuthState,
  exchangeCodeForTokens,
  saveNetworkConnection,
  disconnectNetwork,
  getRedirectUri,
  saveAppCredentials,
  getAppCredentialsStatus
} from './services/oauthService.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/**
 * CORS restricted to the configured dashboard origins. The previous `*` policy
 * let any website on the internet call this engine from a user's browser.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/**
 * Shared-secret guard for every state-changing route. Without it, anyone who can
 * reach this port can spend the tenant's Gemini quota and publish to their
 * social accounts.
 */
function requireApiKey(req, res, next) {
  if (!config.engineApiKey) {
    return res.status(500).json({
      error: 'ENGINE_API_KEY não configurada no .env. O motor recusa requisições até que ela seja definida.'
    });
  }
  if (req.headers['x-api-key'] !== config.engineApiKey) {
    return res.status(401).json({ error: 'API key inválida ou ausente.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Hermes Content Engine',
    networks: {
      youtube: Boolean(config.oauth.youtube.clientId && config.oauth.youtube.clientSecret),
      tiktok: Boolean(config.oauth.tiktok.clientKey && config.oauth.tiktok.clientSecret),
      instagram: Boolean(config.oauth.instagram.appId && config.oauth.instagram.appSecret)
    },
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Queues a video production job. The pipeline runs in the background; the
 * dashboard follows progress through the Firestore document in real time.
 */
app.post('/api/jobs/trigger', requireApiKey, async (req, res) => {
  const { tenantId, customTopic, customInstruction } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'O campo tenantId é obrigatório.' });

  try {
    const tenantSnap = await db.collection('tenants').doc(tenantId).get();
    if (!tenantSnap.exists) {
      return res.status(404).json({ error: `Canal '${tenantId}' não encontrado.` });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.collection('video_jobs').doc(jobId).set({
      id: jobId,
      tenantId,
      tenantName: tenantSnap.data().name || tenantSnap.data().nome || tenantId,
      status: JOB_STATUS.QUEUED,
      customTopic: customTopic || null,
      customInstruction: customInstruction || null,
      triggerType: req.headers['user-agent']?.includes('n8n') ? 'CRON' : 'MANUAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    executeVideoPipeline({ tenantId, jobId, customTopic, customInstruction }).catch(err => {
      console.error(`[Server] Job ${jobId} falhou:`, err.message);
    });

    res.status(202).json({ message: 'Job de produção enfileirado.', jobId, status: JOB_STATUS.QUEUED });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// OAuth — real authorization-code exchange
// ---------------------------------------------------------------------------

/**
 * Returns the provider consent URL for a tenant to open in the browser.
 */
app.get('/api/oauth/:network/start', requireApiKey, async (req, res) => {
  const { network } = req.params;
  const { tenantId } = req.query;

  if (!SUPPORTED_NETWORKS.includes(network)) {
    return res.status(400).json({ error: `Rede não suportada: ${network}` });
  }
  if (!tenantId) return res.status(400).json({ error: 'O parâmetro tenantId é obrigatório.' });

  try {
    const authUrl = await buildAuthUrl({ network, tenantId });
    res.json({ authUrl, redirectUri: getRedirectUri(network) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Per-channel application credentials.
 *
 * These identify Hermes to the platform, not the account. Giving a channel its
 * own app is what isolates its API quota — the YouTube Data API budget is
 * charged per Google Cloud project, so channels sharing one app also share its
 * ~6 uploads/day.
 */
app.get('/api/tenants/:tenantId/app-credentials', requireApiKey, async (req, res) => {
  try {
    res.json(await getAppCredentialsStatus({ tenantId: req.params.tenantId }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tenants/:tenantId/app-credentials/:network', requireApiKey, async (req, res) => {
  const { tenantId, network } = req.params;

  if (!SUPPORTED_NETWORKS.includes(network)) {
    return res.status(400).json({ error: `Rede não suportada: ${network}` });
  }

  const fieldsByNetwork = {
    youtube: ['clientId', 'clientSecret'],
    tiktok: ['clientKey', 'clientSecret'],
    instagram: ['appId', 'appSecret']
  };

  const credentials = Object.fromEntries(
    fieldsByNetwork[network].map(field => [field, (req.body[field] || '').trim()])
  );

  const provided = Object.values(credentials).filter(Boolean).length;
  if (provided > 0 && provided < fieldsByNetwork[network].length) {
    return res.status(400).json({
      error: `Informe ${fieldsByNetwork[network].join(' e ')} juntos, ou ambos vazios para voltar ao app padrão.`
    });
  }

  try {
    const result = await saveAppCredentials({ tenantId, network, credentials });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Provider redirect target. Exchanges the code for tokens, stores them encrypted,
 * then bounces the user back to the dashboard.
 *
 * Deliberately not API-key protected: the provider redirects the user's browser
 * here. The CSRF `state` issued at /start is what authenticates the callback.
 */
app.get('/api/oauth/:network/callback', async (req, res) => {
  const { network } = req.params;
  const { code, state, error: providerError, error_description: providerErrorDesc } = req.query;

  const redirectBack = (params) =>
    res.redirect(`${config.dashboardUrl}/?${new URLSearchParams(params).toString()}`);

  if (providerError) {
    return redirectBack({
      oauth: 'error',
      network,
      message: providerErrorDesc || providerError
    });
  }
  if (!code || !state) {
    return redirectBack({ oauth: 'error', network, message: 'Callback sem code ou state.' });
  }

  const stateEntry = consumeOAuthState(state);
  if (!stateEntry || stateEntry.network !== network) {
    return redirectBack({
      oauth: 'error',
      network,
      message: 'State inválido ou expirado. Reinicie a conexão pela dashboard.'
    });
  }

  try {
    const tokens = await exchangeCodeForTokens({ network, code, tenantId: stateEntry.tenantId });
    await saveNetworkConnection({ tenantId: stateEntry.tenantId, network, tokens });

    return redirectBack({
      oauth: 'success',
      network,
      tenantId: stateEntry.tenantId,
      account: tokens.accountName || ''
    });
  } catch (error) {
    console.error(`[OAuth] Falha no callback de ${network}:`, error.message);
    return redirectBack({ oauth: 'error', network, message: error.message });
  }
});

/**
 * Revokes a stored network connection for a tenant.
 */
app.delete('/api/oauth/:network/connection', requireApiKey, async (req, res) => {
  const { network } = req.params;
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'O parâmetro tenantId é obrigatório.' });

  try {
    await disconnectNetwork({ tenantId, network });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

/**
 * Stores a tenant API key encrypted at rest.
 *
 * The matching `/api/vault/decrypt` endpoint that used to live here was removed:
 * it was unauthenticated and would hand any caller the plaintext of any stored
 * secret. Decryption now happens only inside the pipeline, server-side.
 */
app.post('/api/vault/credentials', requireApiKey, async (req, res) => {
  const { tenantId, geminiApiKey, pexelsApiKey } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'O campo tenantId é obrigatório.' });

  try {
    const payload = { updatedAt: new Date().toISOString() };
    if (geminiApiKey) payload.geminiApiKey = encryptCredential(geminiApiKey);
    if (pexelsApiKey) payload.pexelsApiKey = encryptCredential(pexelsApiKey);

    await db.collection('tenants').doc(tenantId).collection('credentials').doc('vault').set(payload, { merge: true });
    res.json({ success: true, stored: Object.keys(payload).filter(k => k !== 'updatedAt') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Surface environment problems at boot, but keep serving so /health stays
// reachable for diagnostics.
runPreflight({ throwOnSkew: false }).catch(err => console.warn(err.message));

app.listen(config.port, () => {
  console.log('=======================================================');
  console.log(`🚀 Hermes Core Engine na porta ${config.port}`);
  console.log(`   Health:   ${config.enginePublicUrl}/health`);
  console.log(`   OAuth cb: ${config.enginePublicUrl}/api/oauth/{network}/callback`);
  if (!config.engineApiKey) {
    console.warn('   ⚠️  ENGINE_API_KEY não definida — as rotas protegidas vão recusar tudo.');
  }
  console.log('=======================================================');
});
