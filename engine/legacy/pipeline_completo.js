import { gerarPautasParaCanal, processarProximaIdeia } from './gerador_pautas_e_roteiro.js';
import { processarAudioDoProximoJob } from './gerador_audio.js';
import { processarRenderizacaoDoProximoJob } from './gerador_video.js';
import { processarUploadDoProximoJob } from './upload_youtube.js';

/**
 * PIPELINE MESTRE HERMES - EXECUÇÃO 100% AUTÔNOMA
 * Roda de ponta a ponta todos os módulos do motor:
 * 1. Geração de Pautas (Backlog)
 * 2. Roteirização Gemini (JSON Strict)
 * 3. Síntese de Voz TTS (edge-tts) + Legendas WebVTT (.vtt)
 * 4. Renderização FFmpeg (1080x1920 9:16 + Hardsubs)
 * 5. Distribuição e Publicação (YouTube Shorts)
 */
export async function rodarPipelineCompleto(tenantId = 'tenant_test_1787011929715') {
  console.log('=======================================================');
  console.log('🚀 HERMES CONTENT FACTORY - PIPELINE MESTRE AUTÔNOMO');
  console.log('=======================================================');

  try {
    // Etapa 1: Pautas e Roteiro
    console.log('\n[ETAPA 1/4] Geração de Pautas e Roteiro (Gemini)...');
    await gerarPautasParaCanal(tenantId);
    await processarProximaIdeia(tenantId);

    // Etapa 2: Áudio TTS e Legendas VTT
    console.log('\n[ETAPA 2/4] Geração de Áudio (EdgeTTS) e Legendas (.vtt)...');
    await processarAudioDoProximoJob();

    // Etapa 3: Renderização FFmpeg com Hardsubs
    console.log('\n[ETAPA 3/4] Renderização de Vídeo Vertical com Legendas Queimadas (FFmpeg)...');
    await processarRenderizacaoDoProximoJob();

    // Etapa 4: Publicação no YouTube Shorts
    console.log('\n[ETAPA 4/4] Distribuição e Publicação no YouTube Shorts...');
    await processarUploadDoProximoJob();

    console.log('\n=======================================================');
    console.log('🏆 PIPELINE MESTRE DE PONTA A PONTA CONCLUÍDO COM SUCESSO!');
    console.log('=======================================================');
  } catch (err) {
    console.error('\n❌ Erro durante o pipeline mestre:', err.message);
  }
}

rodarPipelineCompleto();
