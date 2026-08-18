import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { LogIn, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Operator login. The engine authorizes requests by verifying the Firebase ID
 * token this produces, so nothing secret needs to live in the bundle.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');

  const handleEntrar = async e => {
    e.preventDefault();
    setEntrando(true);
    setErro('');

    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      // onAuthStateChanged in App swaps this screen out
    } catch (err) {
      const mensagens = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-not-found': 'Nenhum usuário com esse e-mail.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
        'auth/network-request-failed': 'Falha de rede ao contatar o Firebase.',
        'auth/operation-not-allowed':
          'Login por e-mail/senha está desabilitado no projeto. Ative em Firebase Console → Authentication → Sign-in method.'
      };
      setErro(mensagens[err.code] || err.message);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '400px', padding: '36px 32px',
        display: 'flex', flexDirection: 'column', gap: '22px',
        border: '1px solid rgba(0, 255, 135, 0.25)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <img
            src="/logo-hermes.png"
            alt="Hermes"
            width={88}
            height={88}
            style={{ borderRadius: '50%', boxShadow: '0 0 30px rgba(0, 255, 135, 0.3)' }}
          />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800 }} className="gradient-text">HERMES</h1>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
              SALA DE CONTROLE
            </span>
          </div>
        </div>

        <form onSubmit={handleEntrar} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            type="email"
            className="input-field"
            placeholder="E-mail do operador"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            type="password"
            className="input-field"
            placeholder="Senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />

          {erro && (
            <div style={{
              background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)',
              padding: '11px 13px', borderRadius: '10px', display: 'flex', gap: '9px', alignItems: 'flex-start'
            }}>
              <AlertCircle size={17} style={{ color: '#ff4757', flexShrink: 0, marginTop: '1px' }} />
              <span style={{ fontSize: '12px', lineHeight: 1.5 }}>{erro}</span>
            </div>
          )}

          <button
            type="submit"
            className="gradient-btn"
            disabled={entrando}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '46px' }}
          >
            {entrando
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Entrando...</>
              : <><LogIn size={17} /> Entrar</>}
          </button>
        </form>

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          Usuários são criados em Firebase Console → Authentication.
          Para restringir quem pode operar, liste os e-mails em <code>ALLOWED_OPERATORS</code> no motor.
        </p>
      </div>
    </div>
  );
}
