import admin from 'firebase-admin';
import { google } from 'googleapis';

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Gera URL de Autenticação OAuth2 do YouTube para um Canal Específico
 */
export function gerarUrlAuthYouTube(tenantId) {
  const clientId = process.env.YOUTUBE_CLIENT_ID || 'DEMO_CLIENT_ID';
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || 'DEMO_CLIENT_SECRET';
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ],
    state: tenantId,
    prompt: 'consent'
  });

  return authUrl;
}

/**
 * Salva os Tokens de Conexão de Rede diretamente no documento do Canal no Firestore
 */
export async function salvarConexaoRede(tenantId, rede, tokenData) {
  if (!db) throw new Error('❌ Conexão Firestore não inicializada.');

  const tenantRef = db.collection('tenants').doc(tenantId);
  
  await tenantRef.update({
    [`conexoes.${rede}`]: {
      status: 'CONNECTED',
      access_token: tokenData.access_token || 'token_simulado',
      refresh_token: tokenData.refresh_token || 'refresh_simulado',
      connectedAt: new Date().toISOString(),
      expiresAt: tokenData.expiry_date ? new Date(tokenData.expiry_date).toISOString() : null
    },
    updatedAt: new Date().toISOString()
  });

  console.log(`✅ Conexão da rede [${rede}] salva no documento do Canal [${tenantId}]!`);
  return { success: true, tenantId, rede };
}
