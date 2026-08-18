import express from 'express';
import { config } from './config/env.js';
import { executeVideoPipeline } from './services/pipelineOrchestrator.js';
import { encryptCredential, decryptCredential } from './services/vaultService.js';
import { db } from './config/firebase.js';

const app = express();
app.use(express.json());

// Enable CORS for Dashboard interaction
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Hermes Content Engine',
    timestamp: new Date().toISOString()
  });
});

/**
 * Trigger video job execution (via Dashboard manual force or n8n webhook)
 */
app.post('/api/jobs/trigger', async (req, res) => {
  const { tenantId, customTopic } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'Field tenantId is required.' });
  }

  try {
    // Generate new jobId
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Initialize Firestore Document
    await db.collection('video_jobs').doc(jobId).set({
      id: jobId,
      tenantId,
      status: 'PENDING',
      triggerType: req.headers['user-agent']?.includes('n8n') ? 'CRON' : 'MANUAL_FORCE',
      createdAt: new Date().toISOString()
    });

    // Execute pipeline asynchronously in background task
    executeVideoPipeline({ tenantId, jobId, customTopic }).catch(err => {
      console.error(`[Server] Background job ${jobId} failed:`, err.message);
    });

    res.status(202).json({
      message: 'Video production job triggered successfully.',
      jobId,
      status: 'PENDING'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Encrypt sensitive credential helper endpoint for Dashboard
 */
app.post('/api/vault/encrypt', (req, res) => {
  const { secret } = req.body;
  if (!secret) return res.status(400).json({ error: 'Secret string required.' });
  const encrypted = encryptCredential(secret);
  res.json({ encrypted });
});

/**
 * Decrypt sensitive credential helper endpoint
 */
app.post('/api/vault/decrypt', (req, res) => {
  const { encryptedSecret } = req.body;
  if (!encryptedSecret) return res.status(400).json({ error: 'Encrypted string required.' });
  const decrypted = decryptCredential(encryptedSecret);
  res.json({ decrypted });
});

// Start Express Server
app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Hermes Core Engine Server running on port ${config.port}`);
  console.log(`   Health Check: http://localhost:${config.port}/health`);
  console.log(`=======================================================`);
});
