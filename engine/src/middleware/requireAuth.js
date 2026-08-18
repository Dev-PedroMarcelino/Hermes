import { auth } from '../config/firebase.js';
import { config } from '../config/env.js';

/**
 * Authenticates operators with Firebase Auth ID tokens.
 *
 * This replaces the previous shared-secret header. A Vite dashboard inlines
 * every VITE_* variable into the JavaScript bundle it ships, so on a public
 * deploy an API key there is readable by anyone who opens devtools — and with
 * it they could queue jobs and publish to the connected channels. An ID token
 * is short-lived, issued per user by Firebase, and verified here against the
 * project's public keys, so nothing secret ever reaches the browser.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Autenticação obrigatória. Faça login na dashboard.' });
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (err) {
    // Firebase rejects expired tokens too; the dashboard refreshes and retries
    const expired = err.code === 'auth/id-token-expired';
    return res.status(401).json({
      error: expired ? 'Sessão expirada. Recarregue a dashboard.' : 'Token de autenticação inválido.',
      code: err.code || 'auth/invalid-token'
    });
  }

  // With no allowlist, any account that exists in the Firebase project may
  // operate. That is fine for a single-operator setup, but it means anyone who
  // can create an account in the project gets in — so disable self sign-up in
  // Firebase Console → Authentication → Settings → User actions before exposing
  // the engine publicly.
  if (config.allowedOperators.length > 0) {
    const email = (decoded.email || '').toLowerCase();
    const authorized = config.allowedOperators.some(
      entry => entry === decoded.uid || entry.toLowerCase() === email
    );

    if (!authorized) {
      console.warn(`[Auth] Acesso negado para ${email || decoded.uid}`);
      return res.status(403).json({ error: 'Esta conta não tem permissão para operar o Hermes.' });
    }
  }

  req.operator = { uid: decoded.uid, email: decoded.email || null };
  next();
}
