import axios from 'axios';
import crypto from 'crypto';
import { google } from 'googleapis';
import { db, FieldValue } from '../config/firebase.js';
import { config } from '../config/env.js';
import { encryptCredential, decryptCredential } from './vaultService.js';

/**
 * Real server-side OAuth2 for the distribution networks.
 *
 * The previous implementation only built an authorization URL and stored the raw
 * authorization `code` in Firestore as if it were a live connection. An auth code
 * is single-use and expires in minutes — it can never publish anything. Every
 * network below now performs the actual code -> token exchange and stores the
 * resulting tokens encrypted in `tenants/{tenantId}/credentials/vault`.
 */

export const SUPPORTED_NETWORKS = ['youtube', 'tiktok', 'instagram'];

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
];

const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management'
];

/** In-memory CSRF state store: state -> { tenantId, network, createdAt } */
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates() {
  const now = Date.now();
  for (const [state, entry] of pendingStates) {
    if (now - entry.createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

export function createOAuthState(tenantId, network) {
  pruneExpiredStates();
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { tenantId, network, createdAt: Date.now() });
  return state;
}

export function consumeOAuthState(state) {
  pruneExpiredStates();
  const entry = pendingStates.get(state);
  if (entry) pendingStates.delete(state);
  return entry || null;
}

export function getRedirectUri(network) {
  return `${config.enginePublicUrl}/api/oauth/${network}/callback`;
}

/**
 * Resolves which *application* credentials to use for a channel.
 *
 * These are not account credentials — they identify Hermes to the platform. A
 * channel may register its own app (its own Google Cloud project, its own
 * TikTok app); otherwise the platform-wide app from .env is used.
 *
 * Registering a per-channel app is what unlocks parallel throughput: the
 * YouTube Data API quota (10.000 units/day, 1.600 per upload) is charged per
 * Google Cloud project, not per authorized account. Channels sharing one app
 * also share its ~6 uploads/day.
 *
 * @returns {Promise<{credentials: Object, source: 'tenant'|'platform'}>}
 */
export async function resolveAppCredentials({ tenantId, network }) {
  const vaultSnap = await db
    .collection('tenants').doc(tenantId)
    .collection('credentials').doc('vault')
    .get();

  const stored = vaultSnap.exists ? vaultSnap.data().appCredentials?.[network] : null;

  const decryptAll = fields =>
    Object.fromEntries(fields.map(field => [field, decryptCredential(stored[field])]));

  if (network === 'youtube') {
    if (stored?.clientId && stored?.clientSecret) {
      return { credentials: decryptAll(['clientId', 'clientSecret']), source: 'tenant' };
    }
    const { clientId, clientSecret } = config.oauth.youtube;
    if (!clientId || !clientSecret) {
      throw new Error(
        'Nenhum app do YouTube configurado para este canal, e YOUTUBE_CLIENT_ID/SECRET ausentes no .env.'
      );
    }
    return { credentials: { clientId, clientSecret }, source: 'platform' };
  }

  if (network === 'tiktok') {
    if (stored?.clientKey && stored?.clientSecret) {
      return { credentials: decryptAll(['clientKey', 'clientSecret']), source: 'tenant' };
    }
    const { clientKey, clientSecret } = config.oauth.tiktok;
    if (!clientKey || !clientSecret) {
      throw new Error(
        'Nenhum app do TikTok configurado para este canal, e TIKTOK_CLIENT_KEY/SECRET ausentes no .env.'
      );
    }
    return { credentials: { clientKey, clientSecret }, source: 'platform' };
  }

  if (network === 'instagram') {
    if (stored?.appId && stored?.appSecret) {
      return { credentials: decryptAll(['appId', 'appSecret']), source: 'tenant' };
    }
    const { appId, appSecret } = config.oauth.instagram;
    if (!appId || !appSecret) {
      throw new Error(
        'Nenhum app do Instagram configurado para este canal, e INSTAGRAM_APP_ID/SECRET ausentes no .env.'
      );
    }
    return { credentials: { appId, appSecret }, source: 'platform' };
  }

  throw new Error(`Rede não suportada: ${network}`);
}

/**
 * Saves a channel's own application credentials, encrypted at rest.
 * Passing empty values clears the override so the channel falls back to .env.
 */
export async function saveAppCredentials({ tenantId, network, credentials }) {
  const vaultRef = db.collection('tenants').doc(tenantId).collection('credentials').doc('vault');

  const isClearing = Object.values(credentials).every(value => !value);
  if (isClearing) {
    await vaultRef.set({ appCredentials: { [network]: FieldValue.delete() } }, { merge: true });
    return { cleared: true };
  }

  const encrypted = Object.fromEntries(
    Object.entries(credentials).map(([key, value]) => [key, encryptCredential(value)])
  );

  // A short plaintext hint lets the dashboard show which app is configured
  // without ever handing the secret back to the browser.
  const publicIdentifier = credentials.clientId || credentials.clientKey || credentials.appId || '';
  encrypted.hint = publicIdentifier.length > 12
    ? `...${publicIdentifier.slice(-12)}`
    : publicIdentifier;
  encrypted.updatedAt = new Date().toISOString();

  await vaultRef.set({ appCredentials: { [network]: encrypted } }, { merge: true });
  return { cleared: false, hint: encrypted.hint };
}

/**
 * Reports, per network, whether the channel uses its own app or the shared one.
 * Never returns secret values.
 */
export async function getAppCredentialsStatus({ tenantId }) {
  const vaultSnap = await db
    .collection('tenants').doc(tenantId)
    .collection('credentials').doc('vault')
    .get();

  const stored = vaultSnap.exists ? vaultSnap.data().appCredentials || {} : {};
  const platformConfigured = {
    youtube: Boolean(config.oauth.youtube.clientId && config.oauth.youtube.clientSecret),
    tiktok: Boolean(config.oauth.tiktok.clientKey && config.oauth.tiktok.clientSecret),
    instagram: Boolean(config.oauth.instagram.appId && config.oauth.instagram.appSecret)
  };

  return Object.fromEntries(
    SUPPORTED_NETWORKS.map(network => {
      const hasOwnApp = Boolean(stored[network]);
      return [network, {
        source: hasOwnApp ? 'tenant' : 'platform',
        hint: stored[network]?.hint || null,
        usable: hasOwnApp || platformConfigured[network]
      }];
    })
  );
}

/**
 * Builds the provider consent URL the user must visit.
 */
export async function buildAuthUrl({ network, tenantId }) {
  const { credentials } = await resolveAppCredentials({ tenantId, network });
  const state = createOAuthState(tenantId, network);
  const redirectUri = getRedirectUri(network);

  if (network === 'youtube') {
    const oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      redirectUri
    );
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: YOUTUBE_SCOPES,
      state,
      prompt: 'consent', // forces a refresh_token on repeat authorizations
      include_granted_scopes: true
    });
  }

  if (network === 'tiktok') {
    const params = new URLSearchParams({
      client_key: credentials.clientKey,
      scope: TIKTOK_SCOPES.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  if (network === 'instagram') {
    const params = new URLSearchParams({
      client_id: credentials.appId,
      redirect_uri: redirectUri,
      scope: INSTAGRAM_SCOPES.join(','),
      response_type: 'code',
      state
    });
    return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  }

  throw new Error(`Rede não suportada: ${network}`);
}

/**
 * Exchanges an authorization code for real, usable tokens.
 * @returns {Promise<Object>} Plain (not yet encrypted) token payload
 */
export async function exchangeCodeForTokens({ network, code, tenantId }) {
  const redirectUri = getRedirectUri(network);
  // Must be the same app that issued the authorization code
  const { credentials } = await resolveAppCredentials({ tenantId, network });

  if (network === 'youtube') {
    const { clientId, clientSecret } = credentials;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        'O Google não retornou refresh_token. Revogue o acesso do app em myaccount.google.com/permissions e conecte novamente.'
      );
    }

    // Read back the channel identity so the dashboard can show which account is linked
    oauth2Client.setCredentials(tokens);
    let channelTitle = 'Canal do YouTube';
    let channelId = null;
    try {
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const me = await youtube.channels.list({ part: 'snippet', mine: true });
      const channel = me.data.items?.[0];
      if (channel) {
        channelTitle = channel.snippet?.title || channelTitle;
        channelId = channel.id;
      }
    } catch (err) {
      console.warn('[OAuth] Não foi possível ler o canal do YouTube:', err.message);
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      accountName: channelTitle,
      accountId: channelId
    };
  }

  if (network === 'tiktok') {
    const { clientKey, clientSecret } = credentials;
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const data = response.data;
    if (data.error) {
      throw new Error(`TikTok OAuth: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString(),
      accountName: 'Conta TikTok',
      accountId: data.open_id
    };
  }

  if (network === 'instagram') {
    const { appId, appSecret } = credentials;

    // Step 1: short-lived user token
    const shortLived = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
      params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }
    });

    // Step 2: exchange for a 60-day long-lived token
    const longLived = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLived.data.access_token
      }
    });

    const longLivedToken = longLived.data.access_token;

    // Step 3: resolve the IG Business account behind one of the user's Pages.
    // Publishing requires an IG Business/Creator account linked to a FB Page —
    // a personal Instagram account cannot post through the Graph API.
    const pages = await axios.get('https://graph.facebook.com/v20.0/me/accounts', {
      params: { access_token: longLivedToken, fields: 'id,name,instagram_business_account' }
    });

    const pageWithIg = (pages.data.data || []).find(page => page.instagram_business_account?.id);
    if (!pageWithIg) {
      throw new Error(
        'Nenhuma conta Instagram Business encontrada. Vincule sua conta Instagram (Business ou Creator) a uma Página do Facebook e tente novamente.'
      );
    }

    return {
      longLivedAccessToken: longLivedToken,
      igUserId: pageWithIg.instagram_business_account.id,
      pageId: pageWithIg.id,
      expiresAt: new Date(Date.now() + (longLived.data.expires_in || 5184000) * 1000).toISOString(),
      accountName: pageWithIg.name,
      accountId: pageWithIg.instagram_business_account.id
    };
  }

  throw new Error(`Rede não suportada: ${network}`);
}

/**
 * Persists tokens encrypted at rest in the tenant vault, and mirrors a
 * non-sensitive connection summary onto the tenant document for the dashboard.
 */
export async function saveNetworkConnection({ tenantId, network, tokens }) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const vaultRef = tenantRef.collection('credentials').doc('vault');

  const encrypted = {};
  for (const [key, value] of Object.entries(tokens)) {
    // Only secrets get encrypted; ids/names/dates stay readable for the UI
    encrypted[key] = ['accessToken', 'refreshToken', 'longLivedAccessToken'].includes(key)
      ? encryptCredential(value)
      : value;
  }

  await vaultRef.set(
    { oauth: { [network]: { ...encrypted, connectedAt: new Date().toISOString() } } },
    { merge: true }
  );

  await tenantRef.set(
    {
      conexoes: {
        [network]: {
          status: 'CONNECTED',
          accountName: tokens.accountName || null,
          accountId: tokens.accountId || null,
          expiresAt: tokens.expiresAt || null,
          connectedAt: new Date().toISOString()
        }
      },
      status: 'ACTIVE',
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );

  return { success: true, tenantId, network };
}

/**
 * Drops a network connection from both the vault and the tenant summary.
 */
export async function disconnectNetwork({ tenantId, network }) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const vaultRef = tenantRef.collection('credentials').doc('vault');

  // Delete only this network's node — a full overwrite would wipe the tenant's
  // Gemini/Pexels keys that live alongside it in the same vault document.
  const vaultSnap = await vaultRef.get();
  if (vaultSnap.exists) {
    await vaultRef.update({ [`oauth.${network}`]: FieldValue.delete() });
  }

  await tenantRef.set(
    { conexoes: { [network]: { status: 'DISCONNECTED', disconnectedAt: new Date().toISOString() } } },
    { merge: true }
  );

  return { success: true };
}
