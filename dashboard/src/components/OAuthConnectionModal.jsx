import { useEffect, useState } from 'react';
import { X, Youtube, ExternalLink, CheckCircle2, AlertCircle, Loader2, Music2, Instagram, Unlink } from 'lucide-react';
import { startOAuthConnection, disconnectNetwork, getEngineHealth } from '../lib/engineApi';

const NETWORK_META = {
  youtube: {
    label: 'YouTube Shorts',
    Icon: Youtube,
    color: '#ff0000',
    requirements: [
      'Projeto no Google Cloud com a YouTube Data API v3 ativada.',
      'Tela de permissão OAuth configurada como "Externo" e seu e-mail em "Usuários de teste".',
      'Enquanto o app não passar pela verificação do Google, os vídeos sobem como PRIVADOS.',
      'Cota padrão: 10.000 unidades/dia e cada upload custa 1.600 (~6 vídeos por dia).'
    ]
  },
  tiktok: {
    label: 'TikTok',
    Icon: Music2,
    color: '#00f2ea',
    requirements: [
      'App aprovado no TikTok for Developers com o escopo video.publish.',
      'Sem a auditoria de conteúdo do TikTok, os posts só saem como privados (SELF_ONLY).',
      'O Hermes envia o arquivo por FILE_UPLOAD, então não é preciso verificar domínio.'
    ]
  },
  instagram: {
    label: 'Instagram Reels',
    Icon: Instagram,
    color: '#e1306c',
    requirements: [
      'Conta do Instagram do tipo Business ou Creator (conta pessoal não publica via API).',
      'A conta precisa estar vinculada a uma Página do Facebook.',
      'App na Meta for Developers com a permissão instagram_content_publish aprovada.',
      'Limite da plataforma: 25 publicações por 24 horas.'
    ]
  }
};

/**
 * Runs the real OAuth handshake through the engine.
 *
 * The previous version asked the user to paste an authorization code and saved
 * that raw code to Firestore as if it were a connection. An auth code is
 * single-use and expires within minutes, so nothing could ever be published
 * with it. Now the engine performs the code -> token exchange server-side and
 * stores the tokens encrypted.
 */
export default function OAuthConnectionModal({ channel, rede = 'youtube', onClose, onConnected }) {
  const [status, setStatus] = useState('idle'); // idle | starting | waiting | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const [engineReady, setEngineReady] = useState(null);

  const meta = NETWORK_META[rede] || NETWORK_META.youtube;
  const { Icon } = meta;
  const connectionInfo = channel.conexoes?.[rede];
  const isConnected = connectionInfo?.status === 'CONNECTED';

  // Check whether the engine has credentials configured for this network
  useEffect(() => {
    let cancelled = false;
    getEngineHealth()
      .then(health => {
        if (!cancelled) setEngineReady(Boolean(health.networks?.[rede]));
      })
      .catch(err => {
        if (!cancelled) {
          setEngineReady(false);
          setErrorMessage(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rede]);

  // The engine's callback redirects the browser back to the dashboard with
  // ?oauth=success|error, so read that on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('oauth');
    if (!outcome || params.get('network') !== rede) return;

    if (outcome === 'success') {
      setStatus('success');
      if (onConnected) onConnected(rede, { status: 'CONNECTED', accountName: params.get('account') });
    } else {
      setStatus('error');
      setErrorMessage(params.get('message') || 'A autorização falhou.');
    }
    window.history.replaceState({}, '', window.location.pathname);
  }, [rede, onConnected]);

  const handleConnect = async () => {
    setStatus('starting');
    setErrorMessage('');

    try {
      const { authUrl } = await startOAuthConnection({ network: rede, tenantId: channel.id });
      setStatus('waiting');
      window.open(authUrl, '_blank', 'width=680,height=780');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Desconectar ${meta.label} deste canal?`)) return;
    setStatus('starting');
    try {
      await disconnectNetwork({ network: rede, tenantId: channel.id });
      if (onConnected) onConnected(rede, { status: 'DISCONNECTED' });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(5, 8, 16, 0.92)', backdropFilter: 'blur(14px)',
      zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div className="glass-panel" style={{
        width: '100%', maxWidth: '640px', maxHeight: '94vh', overflowY: 'auto',
        padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px',
        border: '1px solid rgba(0, 255, 135, 0.3)', boxShadow: '0 20px 60px rgba(0, 255, 135, 0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon size={26} style={{ color: meta.color }} />
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Conectar {meta.label}</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Canal: {channel.name || channel.nome}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
            color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer'
          }}>
            <X size={18} />
          </button>
        </div>

        {isConnected && status !== 'success' && (
          <div style={{
            background: 'rgba(0, 255, 135, 0.08)', border: '1px solid rgba(0, 255, 135, 0.3)',
            padding: '14px', borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'center'
          }}>
            <CheckCircle2 size={20} style={{ color: '#00ff87', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', flex: 1 }}>
              <strong>Conectado</strong>
              {connectionInfo.accountName && <> — {connectionInfo.accountName}</>}
              {connectionInfo.expiresAt && (
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Token válido até {new Date(connectionInfo.expiresAt).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
            <button onClick={handleDisconnect} className="btn-secondary"
              style={{ fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Unlink size={13} /> Desconectar
            </button>
          </div>
        )}

        {engineReady === false && (
          <div style={{
            background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)',
            padding: '14px', borderRadius: '12px', display: 'flex', gap: '10px'
          }}>
            <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: '#e5e5e5', lineHeight: 1.5 }}>
              <strong>O motor não tem credenciais de {meta.label} configuradas.</strong><br />
              Preencha as variáveis correspondentes no <code>.env</code> e reinicie o motor.
            </div>
          </div>
        )}

        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
          padding: '16px', borderRadius: '12px'
        }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
            Pré-requisitos da plataforma
          </h4>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {meta.requirements.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>

        {status === 'error' && (
          <div style={{
            background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)',
            padding: '14px', borderRadius: '12px', display: 'flex', gap: '10px'
          }}>
            <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', lineHeight: 1.5 }}>{errorMessage}</div>
          </div>
        )}

        {status === 'success' && (
          <div style={{
            background: 'rgba(0, 255, 135, 0.08)', border: '1px solid rgba(0, 255, 135, 0.3)',
            padding: '14px', borderRadius: '12px', display: 'flex', gap: '10px', alignItems: 'center'
          }}>
            <CheckCircle2 size={20} style={{ color: '#00ff87', flexShrink: 0 }} />
            <div style={{ fontSize: '13px' }}>
              <strong>Conta conectada!</strong> Os tokens foram salvos criptografados no cofre do canal.
            </div>
          </div>
        )}

        {status === 'waiting' && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Loader2 size={14} className="text-accent" style={{ animation: 'spin 1s linear infinite' }} />
            Concluindo a autorização na janela do navegador. Ao terminar, você volta para cá automaticamente.
          </div>
        )}

        <button
          onClick={handleConnect}
          className="gradient-btn"
          disabled={status === 'starting' || engineReady === false}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px' }}
        >
          {status === 'starting'
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Preparando...</>
            : <><ExternalLink size={16} /> {isConnected ? `Reconectar ${meta.label}` : `Autorizar ${meta.label}`}</>}
        </button>
      </div>
    </div>
  );
}
