import admin from 'firebase-admin';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Exclusão em Cascata de Vídeo (Apaga no YouTube real, remove arquivos locais e Firestore)
 */
export async function deletarVideoJob(jobId) {
  console.log(`=======================================================`);
  console.log(`🗑️ EXCLUSÃO EM CASCATA DE VÍDEO [ID: ${jobId}]`);
  console.log(`=======================================================`);

  if (!db) throw new Error('❌ Conexão com o Cloud Firestore não inicializada.');

  const jobRef = db.collection('video_jobs').doc(jobId);
  const jobDoc = await jobRef.get();

  if (!jobDoc.exists) {
    throw new Error(`❌ O Job [${jobId}] não foi encontrado no Firestore.`);
  }

  const jobData = jobDoc.data();

  // 1. Se estiver PUBLICADO e tiver o ID do YouTube, chama a API real para deletar do YouTube
  const youtubeVideoId = jobData.distributionLog?.youtube?.videoId;
  if (jobData.status === 'PUBLISHED' && youtubeVideoId) {
    try {
      console.log(`🌐 Solicitando exclusão do vídeo no YouTube real (Video ID: ${youtubeVideoId})...`);
      
      const clientId = process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
      
      if (clientId && clientSecret) {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        await youtube.videos.delete({ id: youtubeVideoId });
        console.log(`✅ Vídeo [${youtubeVideoId}] removido do YouTube com SUCESSO!`);
      }
    } catch (err) {
      console.warn(`⚠️ Nota ao remover vídeo do YouTube API: ${err.message}`);
    }
  }

  // 2. Apaga arquivos físicos (.mp4, .mp3, .vtt) no disco
  const arquivosParaDeletar = [
    jobData.assets?.finalVideoUrl,
    jobData.assets?.audioUrl,
    jobData.assets?.subtitleUrl
  ].filter(Boolean);

  for (const filePath of arquivosParaDeletar) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Arquivo físico removido: ${filePath}`);
      }
    } catch (err) {
      console.warn(`⚠️ Falha ao remover arquivo ${filePath}:`, err.message);
    }
  }

  // 3. Deleta o documento do Firestore
  await jobRef.delete();
  console.log(`✅ Documento do Job [${jobId}] excluído do Firestore!`);

  return { success: true, jobId };
}

/**
 * Exclusão em Cascata de Canal (Impede se houver vídeos em produção)
 */
export async function deletarCanal(tenantId) {
  console.log(`=======================================================`);
  console.log(`🗑️ EXCLUSÃO EM CASCATA DE CANAL [Tenant ID: ${tenantId}]`);
  console.log(`=======================================================`);

  if (!db) throw new Error('❌ Conexão com o Cloud Firestore não inicializada.');

  // 1. Verifica se há vídeos em produção
  const activeJobsSnap = await db.collection('video_jobs')
    .where('tenantId', '==', tenantId)
    .where('status', 'in', ['AUDIO_GEN', 'VIDEO_RENDER', 'READY_TO_UPLOAD'])
    .get();

  if (!activeJobsSnap.empty) {
    throw new Error(`❌ Não é possível excluir o canal. Existem ${activeJobsSnap.size} vídeos em produção no momento. Aguarde a finalização ou cancele os jobs.`);
  }

  // 2. Exclui todo o histórico de video_jobs do canal
  const jobsSnap = await db.collection('video_jobs')
    .where('tenantId', '==', tenantId)
    .get();

  const batch = db.batch();
  for (const doc of jobsSnap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  console.log(`✅ ${jobsSnap.size} jobs de vídeo associados foram removidos do Firestore.`);

  // 3. Exclui a sub-coleção de pautas do canal
  const pautasSnap = await db.collection('tenants').doc(tenantId).collection('pautas').get();
  const pautasBatch = db.batch();
  for (const doc of pautasSnap.docs) {
    pautasBatch.delete(doc.ref);
  }
  await pautasBatch.commit();
  console.log(`✅ ${pautasSnap.size} pautas associadas foram removidas.`);

  // 4. Exclui o documento do Canal (tenant)
  await db.collection('tenants').doc(tenantId).delete();
  console.log(`✅ Documento do Canal [${tenantId}] excluído com SUCESSO!`);

  return { success: true, tenantId };
}
