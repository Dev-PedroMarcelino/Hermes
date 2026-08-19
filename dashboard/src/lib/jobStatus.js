/**
 * Job progress model, mirroring JOB_STATUS in
 * engine/src/services/pipelineOrchestrator.js. Keep both in sync.
 */

const STAGES = {
  QUEUED: { percent: 5, step: 0, label: 'Na fila aguardando o worker' },
  SCRIPTING: { percent: 15, step: 1, label: '1/6 · Gerando roteiro com o Gemini' },
  AUDIO_GEN: { percent: 32, step: 2, label: '2/6 · Sintetizando locução neural (EdgeTTS)' },
  MEDIA_FETCH: { percent: 48, step: 3, label: '3/6 · Baixando clipes de fundo (Pexels)' },
  VIDEO_RENDER: { percent: 66, step: 4, label: '4/6 · Renderizando vídeo 9:16 com legendas (FFmpeg)' },
  READY_TO_UPLOAD: { percent: 100, step: 6, label: 'Vídeo pronto! (Conecte uma rede social para publicar)' },
  UPLOADING: { percent: 90, step: 5, label: '5/6 · Publicando nas redes conectadas' },
  PUBLISHED: { percent: 100, step: 6, label: '6/6 · Publicado!' },
  FAILED: { percent: 100, step: 6, label: 'Falhou' }
};

const FALLBACK = { percent: 10, step: 0, label: 'Iniciando...' };

export const TOTAL_STEPS = 6;

export function getProgressStage(status, job = {}) {
  const stage = STAGES[status] || FALLBACK;
  if (status === 'VIDEO_RENDER' && typeof job.renderProgress === 'number') {
    const p = Math.min(100, Math.max(0, Math.round(job.renderProgress)));
    const dynamicPercent = 66 + Math.round((p / 100) * 14); // 66% -> 80%
    return {
      ...stage,
      percent: dynamicPercent,
      label: `4/6 · Renderizando vídeo 9:16 com legendas (${p}%)`
    };
  }
  return stage;
}

export function isTerminal(status) {
  return status === 'PUBLISHED' || status === 'FAILED';
}

export function isFailed(status) {
  return status === 'FAILED';
}

/** Human label for a distribution target stored on the tenant. */
export const NETWORK_LABELS = {
  YOUTUBE_SHORTS: 'YouTube Shorts',
  TIKTOK: 'TikTok',
  INSTAGRAM_REELS: 'Instagram Reels'
};

/** Maps a tenant target network to its OAuth provider key. */
export const NETWORK_TO_PROVIDER = {
  YOUTUBE_SHORTS: 'youtube',
  TIKTOK: 'tiktok',
  INSTAGRAM_REELS: 'instagram'
};
