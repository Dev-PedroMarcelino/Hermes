import { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { X, Youtube, ExternalLink, CheckCircle2, Shield, Key, AlertCircle, Copy } from 'lucide-react';

export default function OAuthConnectionModal({ channel, rede = 'youtube', onClose, onConnected }) {
  const [clientId, setClientId] = useState(import.meta.env.VITE_YOUTUBE_CLIENT_ID || '');
  const [redirectUriOption, setRedirectUriOption] = useState('playground'); // 'playground' | 'vercel' | 'custom'
  const [customRedirectUri, setCustomRedirectUri] = useState(typeof window !== 'undefined' ? `${window.location.origin}` : 'http://localhost:5173');
  const [authCode, setAuthCode] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const getEffectiveRedirectUri = () => {
    if (redirectUriOption === 'playground') return 'https://developers.google.com/oauthplayground';
    if (redirectUriOption === 'vercel') return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return customRedirectUri.trim();
  };

  const effectiveRedirectUri = getEffectiveRedirectUri();
  const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');

  const getGoogleAuthUrl = () => {
    const finalClientId = clientId.trim() || 'SEU_CLIENT_ID_REAL.apps.googleusercontent.com';
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(finalClientId)}&redirect_uri=${encodeURIComponent(effectiveRedirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${channel.id}`;
  };

  const abrirJanelaLoginGoogle = () => {
    if (!clientId.trim()) {
      alert('Por favor, digite o seu Client ID do Google Cloud Console.');
      return;
    }
    window.open(getGoogleAuthUrl(), '_blank', 'width=650,height=750');
  };

  const copiarUri = () => {
    navigator.clipboard.writeText(effectiveRedirectUri);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleConfirmarConexao = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (db && channel.id) {
        const dadosConexao = {
          status: 'CONNECTED',
          clientId: clientId.trim(),
          redirectUri: effectiveRedirectUri,
          authCode: authCode.trim() || 'oauth_code_confirmado',
          connectedAt: new Date().toISOString(),
          accountName: `Canal YouTube (${channel.name || channel.nome})`
        };

        await updateDoc(doc(db, 'tenants', channel.id), {
          [`conexoes.${rede}`]: dadosConexao
        });

        if (onConnected) onConnected(rede, dadosConexao);
      }

      setSucesso(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      alert(`Erro ao salvar conexão: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 16, 0.92)',
      backdropFilter: 'blur(14px)',
      zIndex: 1100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '680px',
        maxHeight: '94vh',
        overflowY: 'auto',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        border: '1px solid rgba(0, 255, 135, 0.3)',
        boxShadow: '0 20px 60px rgba(0, 255, 135, 0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Youtube size={26} style={{ color: '#ff0000' }} />
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Conectar YouTube OAuth2</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Canal: {channel.name || channel.nome}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-color)',
              color: '#fff',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Instrução para o Erro 403: org_internal */}
        <div style={{ background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)', padding: '14px', borderRadius: '12px', display: 'flex', gap: '10px' }}>
          <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: '#e5e5e5', lineHeight: '1.5' }}>
            <strong>Como resolver o "Erro 403: org_internal":</strong><br />
            No Google Cloud Console em <strong>Tela de permissão OAuth</strong>, altere o Tipo de Usuário para <strong>Externo (External)</strong> e adicione o seu e-mail em <strong>Usuários de Teste</strong>.
          </div>
        </div>

        <form onSubmit={handleConfirmarConexao} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Passo 1: Client ID */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Key size={14} className="text-accent" /> 1. Seu Client ID do Google Cloud Console
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: 123456789-abcdefg.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            />
          </div>

          {/* Passo 2: Seleção da URI */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Shield size={14} className="text-accent" /> 2. Escolha a URI de Redirecionamento (Redirect URI)
            </label>
            <select
              className="input-field"
              value={redirectUriOption}
              onChange={(e) => setRedirectUriOption(e.target.value)}
            >
              <option value="playground">Google OAuth Playground (Recomendado - https://developers.google.com/oauthplayground)</option>
              <option value="vercel">URL Atual da Dashboard ({typeof window !== 'undefined' ? window.location.origin : 'https://hermes-lake-phi.vercel.app'})</option>
              <option value="custom">URL Personalizada / Localhost</option>
            </select>

            {redirectUriOption === 'custom' && (
              <input
                type="text"
                className="input-field"
                style={{ marginTop: '8px' }}
                placeholder="Ex: http://localhost:5173"
                value={customRedirectUri}
                onChange={(e) => setCustomRedirectUri(e.target.value)}
              />
            )}

            <div style={{ marginTop: '8px', background: 'rgba(0,0,0,0.4)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#00ff87', fontFamily: 'monospace' }}>
                {effectiveRedirectUri}
              </span>
              <button
                type="button"
                onClick={copiarUri}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Copy size={12} /> {copiado ? 'Copiado!' : 'Copiar URI'}
              </button>
            </div>
          </div>

          {/* Passo 3: Fazer Login */}
          <div style={{ background: 'rgba(0, 255, 135, 0.04)', border: '1px solid rgba(0, 255, 135, 0.2)', padding: '16px', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: '#00ff87' }}>
              3. Abrir Tela de Login do Google
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
              Após configurar o app para "Externo" no Google Console, clique abaixo para logar com seu e-mail.
            </p>

            <button
              type="button"
              onClick={abrirJanelaLoginGoogle}
              className="gradient-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
            >
              <ExternalLink size={16} /> Abrir Login do Google OAuth2
            </button>
          </div>

          {/* Passo 4: Código de Autorização */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Key size={14} className="text-accent" /> 4. Cole o Código de Autorização (Code)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Cole aqui o código gerado (Ex: 4/0AVG7...)"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <button type="submit" className="gradient-btn" disabled={salvando}>
              {salvando ? 'Salvando no Firestore...' : 'Confirmar & Salvar Conexão do Canal'}
            </button>

            {sucesso && (
              <span style={{ color: '#00ff87', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> Canal Conectado!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
