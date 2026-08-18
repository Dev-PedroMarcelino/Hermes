import express from 'express';
import fs from 'fs-extra';
import { config, isOriginAllowed } from './config/env.js';
import { db } from './config/firebase.js';
import { runPreflight } from './config/preflight.js';
import { requireAuth } from './middleware/requireAuth.js';
import { JOB_STATUS } from './services/pipelineOrchestrator.js';
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
import { resolvePublicVideo } from './services/publicVideoService.js';
import { startWorkerLoop, isWorkerRunning } from './worker/productionWorker.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

/**
 * CORS restricted to the configured dashboard origins. A `*` policy would let
 * any website on the internet drive this engine from a logged-in user's browser.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Hermes Content Engine',
    // Whether the *default* app is configured. A channel with its own app can
    // still connect a network that shows false here.
    networks: {
      youtube: Boolean(config.oauth.youtube.clientId && config.oauth.youtube.clientSecret),
      tiktok: Boolean(config.oauth.tiktok.clientKey && config.oauth.tiktok.clientSecret),
      instagram: Boolean(config.oauth.instagram.appId && config.oauth.instagram.appSecret)
    },
    worker: { ativo: isWorkerRunning(), noMesmoProcesso: config.runWorkerInProcess },
    operadoresConfigurados: config.allowedOperators.length,
    estrategiaDeVideo: config.publicVideoStrategy,
    timestamp: new Date().toISOString()
  });
});

/**
 * Serves a rendered video to the social platforms.
 *
 * Intentionally unauthenticated: Instagram's servers fetch this URL, and they
 * carry no operator credentials. The unguessable, expiring per-job token in the
 * path is what protects it.
 */
app.get('/public/videos/:jobId/:token', async (req, res) => {
  const { jobId, token } = req.params;

  try {
    const result = await resolvePublicVideo({ jobId, token });
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { size } = await fs.stat(result.filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', size);
    // Meta issues ranged requests while probing the file
    res.setHeader('Accept-Ranges', 'bytes');
    fs.createReadStream(result.filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/**
 * Queues a video production job. The pipeline runs in the background; the
 * dashboard follows progress through the Firestore document in real time.
 */
app.post('/api/jobs/trigger', requireAuth, async (req, res) => {
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

    // Only enqueue here. Running the pipeline inline as well would race the
    // worker: both would try to claim the same QUEUED job and could render and
    // publish it twice.
    if (!isWorkerRunning()) {
      console.warn(
        `[Server] Job ${jobId} enfileirado, mas nenhum worker está ativo neste processo. ` +
          'Rode "npm run worker" ou defina ENABLE_WORKER=true.'
      );
    }

    res.status(202).json({
      message: 'Job de produção enfileirado.',
      jobId,
      status: JOB_STATUS.QUEUED,
      workerAtivo: isWorkerRunning()
    });
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
app.get('/api/oauth/:network/start', requireAuth, async (req, res) => {
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
app.get('/api/tenants/:tenantId/app-credentials', requireAuth, async (req, res) => {
  try {
    res.json(await getAppCredentialsStatus({ tenantId: req.params.tenantId }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tenants/:tenantId/app-credentials/:network', requireAuth, async (req, res) => {
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

  const stateEntry = await consumeOAuthState(state);
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
app.delete('/api/oauth/:network/connection', requireAuth, async (req, res) => {
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
app.post('/api/vault/credentials', requireAuth, async (req, res) => {
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

// Bind to 0.0.0.0 so container platforms can route traffic to the process
app.listen(config.port, '0.0.0.0', async () => {
  console.log('=======================================================');
  console.log(`🚀 Hermes Core Engine na porta ${config.port}`);
  console.log(`   Health:   ${config.enginePublicUrl}/health`);
  console.log(`   OAuth cb: ${config.enginePublicUrl}/api/oauth/{network}/callback`);
  console.log(`   Vídeo:    estratégia "${config.publicVideoStrategy}"`);

  if (config.allowedOperators.length === 0) {
    console.warn('   ⚠️  ALLOWED_OPERATORS vazio — as rotas autenticadas vão recusar tudo.');
  }

  if (config.runWorkerInProcess) {
    console.log('   Worker:   ativo neste mesmo processo (ENABLE_WORKER=true)');
    console.log('=======================================================');
    try {
      await startWorkerLoop();
    } catch (err) {
      console.error('[Server] Falha ao iniciar o worker:', err.message);
    }
  } else {
    console.log('   Worker:   separado — rode "npm run worker"');
    console.log('=======================================================');
  }
});
