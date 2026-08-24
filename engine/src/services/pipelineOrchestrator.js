import path from 'path';
import fs from 'fs-extra';
import { db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { decryptCredential, encryptCredential } from './vaultService.js';
import { resolveAppCredentials } from './oauthService.js';
import { generateVideoScript } from './geminiService.js';
import { generateSpeech } from './ttsService.js';
import { generateAssSubtitles } from './subtitleService.js';
import { fetchStockVideos } from './mediaCollectorService.js';
import { renderFinalVideo, probeDuration } from './renderEngine.js';
import { createPublicVideoUrl } from './publicVideoService.js';
import { uploadToYouTubeShorts } from './uploaders/youtubeUploader.js';
import { uploadToTikTok, refreshTikTokToken, waitForTikTokPublish } from './uploaders/tiktokUploader.js';
import { uploadToInstagramReels } from './uploaders/instagramUploader.js';

// Resolved from config so the location does not depend on which directory npm
// was invoked from, and can be pointed at a writable path on ephemeral hosts.
const TEMP_DIR = config.paths.temp;
const OUTPUT_DIR = config.paths.output;

/**
 * Job status ladder. The dashboard renders its progress bar off these values,
 * so the names here and in MonitorProducao must stay in sync.
 */
export const JOB_STATUS = {
  QUEUED: 'QUEUED',
  SCRIPTING: 'SCRIPTING',
  AUDIO_GEN: 'AUDIO_GEN',
  MEDIA_FETCH: 'MEDIA_FETCH',
  VIDEO_RENDER: 'VIDEO_RENDER',
  READY_TO_UPLOAD: 'READY_TO_UPLOAD',
  UPLOADING: 'UPLOADING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED'
};

async function setStatus(jobRef, status, extra = {}) {
  await jobRef.set(
    { status, updatedAt: new Date().toISOString(), ...extra },
    { merge: true }
  );
  console.log(`[Pipeline] → ${status}`);
}

/**
 * Raises a dashboard-visible alert and flags the tenant when a credential dies.
 */
async function raiseAuthAlert({ tenantId, tenantName, network, message }) {
  await db.collection('system_alerts').add({
    tenantId,
    network,
    type: 'TOKEN_EXPIRED',
    message: `Credencial de ${network} inválida ou expirada para o canal '${tenantName}': ${message}`,
    resolved: false,
    createdAt: new Date().toISOString()
  });
  await db.collection('tenants').doc(tenantId).set({ status: 'NEEDS_AUTH' }, { merge: true });
}

function isAuthError(message = '') {
  return /token|401|unauthorized|auth|credential|invalid_grant|expirou/i.test(message);
}

/**
 * Runs the full production pipeline for one job: script → narration →
 * subtitles → stock footage → render → distribution.
 *
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string} params.jobId
 * @param {string} [params.customTopic] Specific subject requested by the user
 * @param {string} [params.customInstruction] Extra direction for the AI
 */
export async function executeVideoPipeline({ tenantId, jobId, customTopic = null, customInstruction = null }) {
  console.log(`\n[Pipeline] ===== Job ${jobId} | Tenant ${tenantId} =====`);

  const jobRef = db.collection('video_jobs').doc(jobId);
  const tenantRef = db.collection('tenants').doc(tenantId);
  const vaultRef = tenantRef.collection('credentials').doc('vault');

  const workDir = path.join(TEMP_DIR, jobId);
  await fs.ensureDir(workDir);
  await fs.ensureDir(OUTPUT_DIR);

  try {
    // ---- Stage 1: tenant + credentials -------------------------------------
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) throw new Error(`Canal '${tenantId}' não existe no Firestore.`);

    const tenantData = tenantSnap.data();
    const tenantName = tenantData.name || tenantData.nome || tenantId;
    const vaultSnap = await vaultRef.get();
    const vaultData = vaultSnap.exists ? vaultSnap.data() : {};
    const oauthVault = vaultData.oauth || {};

    const geminiKey = decryptCredential(vaultData.geminiApiKey) || config.geminiApiKey;
    const pexelsKey = decryptCredential(vaultData.pexelsApiKey) || config.pexelsApiKey;

    if (!geminiKey) throw new Error(`Nenhuma GEMINI_API_KEY disponível para o canal ${tenantId}.`);

    // ---- Stage 2: script generation (Gemini) -------------------------------
    await setStatus(jobRef, JOB_STATUS.SCRIPTING);

    const scriptJson = await generateVideoScript({
      apiKey: geminiKey,
      niche: tenantData.niche || tenantData.nicho || 'Curiosidades Gerais',
      brandIdentity: tenantData.brandIdentity || tenantData.tomDeVoz || 'Dinâmico e direto',
      language: tenantData.language || 'pt-BR',
      topic: customTopic,
      instruction: customInstruction
    });

    await setStatus(jobRef, JOB_STATUS.AUDIO_GEN, { script: scriptJson });

    // ---- Stage 3: narration (EdgeTTS) --------------------------------------
    const narrationText = [scriptJson.hook, ...scriptJson.sections.map(s => s.text)]
      .filter(Boolean)
      .join(' ');
    const audioPath = path.join(workDir, 'speech.mp3');

    const { cues } = await generateSpeech({
      text: narrationText,
      outputFilePath: audioPath,
      voice: tenantData.contentConfig?.voiceId || 'pt-BR-AntonioNeural',
      rate: tenantData.contentConfig?.ttsSpeed || '+10%'
    });

    const narrationDuration = await probeDuration(audioPath);
    console.log(`[Pipeline] Narração: ${narrationDuration.toFixed(2)}s (${cues.length} marcações de tempo)`);

    // ---- Stage 4: subtitles -------------------------------------------------
    const assSubtitlePath = path.join(workDir, 'subtitles.ass');
    await generateAssSubtitles({
      sections: [{ text: scriptJson.hook }, ...scriptJson.sections],
      cues,
      outputAssPath: assSubtitlePath,
      totalDurationSeconds: narrationDuration,
      style: tenantData.contentConfig?.subtitleStyle || {}
    });

    // ---- Stage 5: scene visuals (AI Image + Motion / Pexels) ---------------
    await setStatus(jobRef, JOB_STATUS.MEDIA_FETCH);

    const mainVisualTheme = scriptJson.mainVisualTheme || (customTopic ? `${customTopic} stock background` : '');

    const downloadedClips = await fetchStockVideos({
      sections: scriptJson.sections || [],
      mainVisualTheme,
      mediaTypePreference: scriptJson.mediaTypePreference || 'ai_image',
      outputDirPath: workDir,
      pexelsApiKey: pexelsKey,
      geminiApiKey: geminiKey
    });
    console.log(`[Pipeline] ${downloadedClips.length} clipe(s) de fundo preparados para montagem.`);

    // ---- Stage 6: render ----------------------------------------------------
    await setStatus(jobRef, JOB_STATUS.VIDEO_RENDER);

    const outputVideoPath = path.join(OUTPUT_DIR, `${jobId}_final.mp4`);
    let lastPercent = 0;
    await renderFinalVideo({
      videoClips: downloadedClips,
      audioPath,
      assSubtitlePath,
      outputVideoPath,
      onProgress: async (percent) => {
        if (percent - lastPercent >= 5 || percent >= 100) {
          lastPercent = percent;
          await jobRef.set({ renderProgress: percent }, { merge: true }).catch(() => {});
        }
      }
    });

    await setStatus(jobRef, JOB_STATUS.READY_TO_UPLOAD, {
      assets: {
        audioUrl: audioPath,
        subtitleAssUrl: assSubtitlePath,
        finalVideoUrl: outputVideoPath
      }
    });

    // ---- Stage 7: distribution ---------------------------------------------
    await setStatus(jobRef, JOB_STATUS.UPLOADING);

    // When the channel does not pin an explicit list, publish to every network
    // that actually has stored credentials. Otherwise connecting TikTok or
    // Instagram would have no effect, since nothing else populates this field.
    const providerToNetwork = {
      youtube: 'YOUTUBE_SHORTS',
      tiktok: 'TIKTOK',
      instagram: 'INSTAGRAM_REELS'
    };
    const connectedNetworks = Object.keys(oauthVault)
      .map(provider => providerToNetwork[provider])
      .filter(Boolean);

    let targetNetworks = tenantData.targetNetworks?.length
      ? tenantData.targetNetworks.filter(net => connectedNetworks.includes(net))
      : connectedNetworks;

    // Fallback: if tenant targetNetworks had items but none were connected, fallback to connectedNetworks
    if (targetNetworks.length === 0 && connectedNetworks.length > 0) {
      targetNetworks = connectedNetworks;
    }

    if (targetNetworks.length === 0) {
      console.log(`[Pipeline] Canal '${tenantId}' não possui redes conectadas. Vídeo pronto em READY_TO_UPLOAD.`);
      await setStatus(jobRef, JOB_STATUS.READY_TO_UPLOAD, {
        notice: 'Vídeo renderizado com sucesso! Conecte o YouTube, TikTok ou Instagram no canal para publicação automática.',
        completedAt: new Date().toISOString()
      });
      return;
    }
    console.log(`[Pipeline] Distribuindo para: ${targetNetworks.join(', ')}`);
    const distributionLog = {};
    let publishedVideoUrl = null;

    // Only Instagram fetches the file from a URL. TikTok receives the bytes
    // directly through chunked FILE_UPLOAD, so it needs no public URL.
    const needsPublicUrl = targetNetworks.includes('INSTAGRAM_REELS');
    let publicVideoUrl = null;
    let storagePath = null;

    if (needsPublicUrl) {
      try {
        const published = await createPublicVideoUrl({ localFilePath: outputVideoPath, tenantId, jobId });
        publicVideoUrl = published.publicUrl;
        storagePath = published.storagePath;
        console.log(`[Pipeline] URL pública do vídeo pronta (estratégia: ${published.strategy}).`);
      } catch (err) {
        console.error('[Pipeline] Falha ao expor o vídeo publicamente:', err.message);
      }
    }

    const hashtags = scriptJson.hashtags || [];
    const caption = `${scriptJson.title}\n\n${scriptJson.hook}\n\n${hashtags.join(' ')}`;

    for (const network of targetNetworks) {
      try {
        if (network === 'YOUTUBE_SHORTS') {
          const yt = oauthVault.youtube;
          if (!yt) throw new Error('Canal do YouTube não conectado.');

          // Refreshing must use the same app that issued the token — which may
          // be this channel's own Google Cloud project rather than the shared one.
          const { credentials: ytApp } = await resolveAppCredentials({ tenantId, network: 'youtube' });

          const result = await uploadToYouTubeShorts({
            videoPath: outputVideoPath,
            title: scriptJson.title,
            description: caption,
            tags: hashtags.map(h => h.replace('#', '')),
            privacyStatus: tenantData.contentConfig?.privacyStatus || 'public',
            clientId: ytApp.clientId,
            clientSecret: ytApp.clientSecret,
            refreshToken: decryptCredential(yt.refreshToken),
            accessToken: decryptCredential(yt.accessToken)
          });

          publishedVideoUrl = publishedVideoUrl || result.videoUrl;
          distributionLog.youtube = {
            status: 'PUBLISHED',
            videoId: result.videoId,
            videoUrl: result.videoUrl,
            privacyStatus: result.privacyStatus,
            publishedAt: new Date().toISOString()
          };
        } else if (network === 'TIKTOK') {
          const tt = oauthVault.tiktok;
          if (!tt) throw new Error('Conta do TikTok não conectada.');

          // TikTok access tokens expire in ~24h, so always refresh first
          let accessToken = decryptCredential(tt.accessToken);
          const refreshToken = decryptCredential(tt.refreshToken);
          if (refreshToken) {
            const { credentials: ttApp } = await resolveAppCredentials({ tenantId, network: 'tiktok' });
            const refreshed = await refreshTikTokToken({
              clientKey: ttApp.clientKey,
              clientSecret: ttApp.clientSecret,
              refreshToken
            });
            accessToken = refreshed.accessToken;

            // Persist the rotated token — TikTok invalidates the previous one
            await vaultRef.set(
              {
                oauth: {
                  tiktok: {
                    accessToken: encryptCredential(refreshed.accessToken),
                    refreshToken: encryptCredential(refreshed.refreshToken),
                    expiresAt: refreshed.expiresAt
                  }
                }
              },
              { merge: true }
            );
          }

          const result = await uploadToTikTok({
            videoPath: outputVideoPath,
            title: caption,
            accessToken
          });
          const finished = await waitForTikTokPublish({ publishId: result.publishId, accessToken });

          distributionLog.tiktok = {
            status: 'PUBLISHED',
            publishId: result.publishId,
            postId: finished.publiclyAvailablePostId,
            privacyLevel: result.privacyLevel,
            publishedAt: new Date().toISOString()
          };
        } else if (network === 'INSTAGRAM_REELS') {
          const ig = oauthVault.instagram;
          if (!ig) throw new Error('Conta do Instagram não conectada.');
          if (!publicVideoUrl) {
            throw new Error('URL pública do vídeo indisponível (falha no upload para o Firebase Storage).');
          }

          const result = await uploadToInstagramReels({
            igUserId: ig.igUserId,
            caption,
            videoUrl: publicVideoUrl,
            accessToken: decryptCredential(ig.longLivedAccessToken)
          });

          distributionLog.instagram = {
            status: 'PUBLISHED',
            mediaId: result.mediaId,
            permalink: result.permalink,
            publishedAt: new Date().toISOString()
          };
        } else {
          console.warn(`[Pipeline] Rede desconhecida ignorada: ${network}`);
        }
      } catch (uploadErr) {
        console.error(`[Pipeline] Erro publicando em ${network}:`, uploadErr.message);
        distributionLog[network.toLowerCase()] = {
          status: 'FAILED',
          error: uploadErr.message,
          failedAt: new Date().toISOString()
        };

        if (isAuthError(uploadErr.message)) {
          await raiseAuthAlert({ tenantId, tenantName, network, message: uploadErr.message });
        }
      }
    }

    // ---- Final -------------------------------------------------------------
    const anyPublished = Object.values(distributionLog).some(entry => entry.status === 'PUBLISHED');

    const specificErrors = Object.entries(distributionLog)
      .filter(([, v]) => v.status === 'FAILED')
      .map(([k, v]) => `${k.toUpperCase()}: ${v.error}`)
      .join(' | ');

    await jobRef.set(
      {
        status: anyPublished ? JOB_STATUS.PUBLISHED : JOB_STATUS.FAILED,
        publishedVideoUrl,
        distributionLog,
        assets: {
          audioUrl: audioPath,
          subtitleAssUrl: assSubtitlePath,
          finalVideoUrl: outputVideoPath,
          publicVideoUrl,
          storagePath
        },
        errorMessage: anyPublished
          ? null
          : (specificErrors ? `Falha na publicação — ${specificErrors}` : 'Nenhuma rede aceitou a publicação. Verifique as conexões do canal.'),
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );

    console.log(`[Pipeline] Job ${jobId} finalizado (publicado: ${anyPublished}).`);
    return { success: anyPublished, jobId, videoPath: outputVideoPath, distributionLog };
  } catch (pipelineErr) {
    console.error(`[Pipeline] Falha crítica no job ${jobId}:`, pipelineErr.message);
    await jobRef.set(
      {
        status: JOB_STATUS.FAILED,
        errorMessage: pipelineErr.message,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    throw pipelineErr;
  }
}
