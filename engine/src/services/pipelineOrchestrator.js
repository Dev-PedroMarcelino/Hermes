import path from 'path';
import fs from 'fs-extra';
import { db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { decryptCredential } from './vaultService.js';
import { generateVideoScript } from './geminiService.js';
import { generateSpeech } from './ttsService.js';
import { generateAssSubtitles } from './subtitleService.js';
import { fetchStockVideos } from './mediaCollectorService.js';
import { renderFinalVideo } from './renderEngine.js';
import { uploadToYouTubeShorts, refreshYouTubeToken } from './uploaders/youtubeUploader.js';
import { uploadToTikTok, refreshTikTokToken } from './uploaders/tiktokUploader.js';
import { uploadToInstagramReels, refreshInstagramToken } from './uploaders/instagramUploader.js';
import { uploadToKwai } from './uploaders/kwaiUploader.js';

const TEMP_DIR = path.resolve('./tmp_jobs');

/**
 * Executes full video production pipeline for a tenant.
 * @param {Object} params
 * @param {string} params.tenantId Tenant ID
 * @param {string} params.jobId Video Job Document ID
 * @param {string} [params.customTopic] Optional specific topic
 */
export async function executeVideoPipeline({ tenantId, jobId, customTopic = null }) {
  console.log(`[Pipeline] Starting execution for Tenant: ${tenantId}, Job: ${jobId}`);

  const jobRef = db.collection('video_jobs').doc(jobId);
  const tenantRef = db.collection('tenants').doc(tenantId);
  const vaultRef = tenantRef.collection('credentials').doc('vault');

  const workDir = path.join(TEMP_DIR, jobId);
  await fs.ensureDir(workDir);

  try {
    // Stage 1: Read Tenant & Vault Credentials
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new Error(`Tenant '${tenantId}' does not exist in Firestore.`);
    }

    const tenantData = tenantSnap.data();
    const vaultSnap = await vaultRef.get();
    const vaultData = vaultSnap.exists ? vaultSnap.data() : {};

    const geminiKey = decryptCredential(vaultData.geminiApiKey) || config.geminiApiKey;
    const pexelsKey = decryptCredential(vaultData.pexelsApiKey) || config.pexelsApiKey;

    if (!geminiKey) {
      throw new Error(`No Gemini API Key found for tenant ${tenantId}.`);
    }

    // Stage 2: Script Generation (Gemini)
    await jobRef.set({
      status: 'SCRIPTING',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    const scriptJson = await generateVideoScript({
      apiKey: geminiKey,
      niche: tenantData.niche || 'General Curiosities',
      brandIdentity: tenantData.brandIdentity || 'Fast-paced, dynamic',
      language: tenantData.language || 'pt-BR',
      topic: customTopic
    });

    await jobRef.set({
      script: scriptJson,
      status: 'AUDIO_GEN',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Stage 3: TTS Speech Synthesis (edge-tts)
    const fullSpeechText = `${scriptJson.hook}. ${scriptJson.sections.map(s => s.text).join(' ')}`;
    const audioPath = path.join(workDir, 'speech.mp3');

    await generateSpeech({
      text: fullSpeechText,
      outputFilePath: audioPath,
      voice: tenantData.contentConfig?.voiceId || 'pt-BR-AntonioNeural',
      rate: tenantData.contentConfig?.ttsSpeed || '+10%'
    });

    // Stage 4: Dynamic Subtitles Generation (.ass format)
    const assSubtitlePath = path.join(workDir, 'subtitles.ass');
    await generateAssSubtitles({
      sections: [{ text: scriptJson.hook, durationEstSeconds: 3 }, ...scriptJson.sections],
      outputAssPath: assSubtitlePath,
      style: tenantData.contentConfig?.subtitleStyle || {}
    });

    // Stage 5: Media Acquisition (Pexels Stock Clips)
    await jobRef.set({ status: 'MEDIA_FETCH', updatedAt: new Date().toISOString() }, { merge: true });
    
    const primaryQuery = scriptJson.sections[0]?.visualSearchQuery || 'technology abstract';
    const downloadedClips = await fetchStockVideos({
      query: primaryQuery,
      outputDirPath: workDir,
      pexelsApiKey: pexelsKey,
      count: 2
    });

    // Stage 6: Video Assembly & Rendering (FFmpeg 1080x1920)
    await jobRef.set({ status: 'RENDERING', updatedAt: new Date().toISOString() }, { merge: true });
    
    const outputVideoPath = path.join(workDir, 'final_rendered_short.mp4');
    await renderFinalVideo({
      videoClips: downloadedClips,
      audioPath: audioPath,
      assSubtitlePath: assSubtitlePath,
      outputVideoPath: outputVideoPath
    });

    // Stage 7: Distribution to Active Social Networks
    await jobRef.set({ status: 'UPLOADING', updatedAt: new Date().toISOString() }, { merge: true });

    const targetNetworks = tenantData.targetNetworks || ['YOUTUBE_SHORTS'];
    const distributionLog = {};
    const oauthVault = vaultData.oauth || {};

    for (const network of targetNetworks) {
      try {
        if (network === 'YOUTUBE_SHORTS' && oauthVault.youtube) {
          let accessToken = decryptCredential(oauthVault.youtube.accessToken);
          const refreshToken = decryptCredential(oauthVault.youtube.refreshToken);
          const clientId = decryptCredential(oauthVault.youtube.clientId);
          const clientSecret = decryptCredential(oauthVault.youtube.clientSecret);

          // Check token expiry & refresh if needed
          if (refreshToken && clientId && clientSecret) {
            try {
              const refreshed = await refreshYouTubeToken({ clientId, clientSecret, refreshToken });
              accessToken = refreshed.accessToken;
            } catch (err) {
              console.warn(`[Pipeline] YouTube token refresh warning for ${tenantId}:`, err.message);
            }
          }

          if (accessToken) {
            const ytResult = await uploadToYouTubeShorts({
              videoPath: outputVideoPath,
              title: scriptJson.title,
              description: `${scriptJson.hook}\n\n${scriptJson.hashtags?.join(' ')}`,
              tags: scriptJson.hashtags?.map(h => h.replace('#', '')) || [],
              accessToken: accessToken
            });

            distributionLog.youtube = {
              status: 'PUBLISHED',
              videoId: ytResult.videoId,
              videoUrl: ytResult.videoUrl,
              publishedAt: new Date().toISOString()
            };
          }
        } else if (network === 'TIKTOK' && oauthVault.tiktok) {
          const accessToken = decryptCredential(oauthVault.tiktok.accessToken);
          if (accessToken) {
            const ttResult = await uploadToTikTok({
              title: `${scriptJson.title} ${scriptJson.hashtags?.join(' ')}`,
              videoUrl: `file://${outputVideoPath}`,
              accessToken: accessToken
            });
            distributionLog.tiktok = { status: 'PUBLISHED', publishId: ttResult.publishId };
          }
        } else if (network === 'INSTAGRAM_REELS' && oauthVault.instagram) {
          const accessToken = decryptCredential(oauthVault.instagram.longLivedAccessToken);
          const igUserId = oauthVault.instagram.igUserId;
          if (accessToken && igUserId) {
            const igResult = await uploadToInstagramReels({
              igUserId: igUserId,
              caption: `${scriptJson.title}\n${scriptJson.hashtags?.join(' ')}`,
              videoUrl: `file://${outputVideoPath}`,
              accessToken: accessToken
            });
            distributionLog.instagram = { status: 'PUBLISHED', mediaId: igResult.mediaId };
          }
        } else if (network === 'KWAI' && oauthVault.kwai) {
          const accessToken = decryptCredential(oauthVault.kwai.accessToken);
          if (accessToken) {
            const kwaiResult = await uploadToKwai({
              title: scriptJson.title,
              videoUrl: `file://${outputVideoPath}`,
              accessToken: accessToken
            });
            distributionLog.kwai = { status: 'PUBLISHED', photoId: kwaiResult.photoId };
          }
        }
      } catch (uploadErr) {
        console.error(`[Pipeline] Upload error for network ${network}:`, uploadErr.message);
        distributionLog[network.toLowerCase()] = {
          status: 'FAILED',
          error: uploadErr.message
        };

        // Create alert entry for token/auth issues
        if (uploadErr.message.includes('token') || uploadErr.message.includes('401') || uploadErr.message.includes('auth')) {
          await db.collection('system_alerts').add({
            tenantId,
            network,
            type: 'TOKEN_EXPIRED',
            message: `Credencial de ${network} expirou ou é inválida para o canal '${tenantData.name}'.`,
            resolved: false,
            createdAt: new Date().toISOString()
          });
          await tenantRef.set({ status: 'NEEDS_AUTH' }, { merge: true });
        }
      }
    }

    // Final Stage: Complete Job
    await jobRef.set({
      status: 'COMPLETED',
      assets: {
        audioUrl: audioPath,
        subtitleAssUrl: assSubtitlePath,
        finalVideoUrl: outputVideoPath
      },
      distributionLog: distributionLog,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[Pipeline] Job ${jobId} completed successfully!`);
    return { success: true, jobId, videoPath: outputVideoPath };

  } catch (pipelineErr) {
    console.error(`[Pipeline] Critical failure on Job ${jobId}:`, pipelineErr.message);
    await jobRef.set({
      status: 'FAILED',
      errorMessage: pipelineErr.message,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    throw pipelineErr;
  } finally {
    // Cleanup transient clips if needed
  }
}
