import https from 'https';
import { config } from './env.js';

/**
 * Maximum tolerated difference between this machine's clock and real time.
 *
 * Both Google (service-account JWT `iat`/`exp`) and Microsoft Edge TTS (the
 * time-derived `Sec-MS-GEC` token) validate timestamps server-side. A skew
 * beyond a few minutes makes Firestore return `16 UNAUTHENTICATED` and Edge TTS
 * return `403` — errors that look like bad credentials but are really a wrong
 * clock. Checking up front turns hours of misdiagnosis into one clear message.
 */
const MAX_CLOCK_SKEW_MS = 3 * 60 * 1000;

/**
 * Measures the offset between the local clock and a trusted server clock.
 * @returns {Promise<number|null>} Skew in ms (positive = local clock ahead)
 */
export function measureClockSkew(timeoutMs = 8000) {
  return new Promise(resolve => {
    const request = https.get('https://www.google.com/generate_204', response => {
      const serverDate = response.headers.date;
      response.resume();
      if (!serverDate) return resolve(null);
      resolve(Date.now() - new Date(serverDate).getTime());
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(null);
    });
    request.on('error', () => resolve(null));
  });
}

/**
 * Verifies the environment can actually authenticate before work begins.
 * @param {Object} [options]
 * @param {boolean} [options.throwOnSkew] Abort instead of only warning
 */
export async function runPreflight({ throwOnSkew = true } = {}) {
  const problems = [];

  if (!config.encryptionKey || config.encryptionKey.length < 16) {
    problems.push('ENCRYPTION_KEY ausente ou com menos de 16 caracteres no .env.');
  }
  if (!config.geminiApiKey) {
    problems.push('GEMINI_API_KEY ausente no .env.');
  }
  if (!config.firebase.projectId || !config.firebase.privateKey) {
    problems.push('Credenciais do Firebase Admin incompletas no .env.');
  }

  const skew = await measureClockSkew();
  if (skew !== null && Math.abs(skew) > MAX_CLOCK_SKEW_MS) {
    const minutes = Math.round(skew / 60000);
    const direction = skew > 0 ? 'adiantado' : 'atrasado';
    problems.push(
      `Relógio do sistema ${direction} em ~${Math.abs(minutes)} minutos em relação ao horário real.\n` +
        '     Isso invalida o JWT da conta de serviço do Firebase (erro "16 UNAUTHENTICATED")\n' +
        '     e o token do Edge TTS (erro "403"). Sincronize o relógio do Windows em\n' +
        '     Configurações → Hora e Idioma → Data e Hora → "Sincronizar agora".'
    );
  }

  if (problems.length > 0) {
    const message = `Verificação de ambiente falhou:\n${problems.map(p => `  ✖ ${p}`).join('\n')}`;
    if (throwOnSkew) throw new Error(message);
    console.warn(message);
    return { ok: false, problems, skew };
  }

  console.log(`[Preflight] Ambiente OK (desvio do relógio: ${skew === null ? 'não medido' : `${skew} ms`}).`);
  return { ok: true, problems: [], skew };
}
