// Hermes Omnichannel Content Factory Dashboard
import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import LoginScreen from './components/LoginScreen';
import MonitorProducao from './components/MonitorProducao';
import GerenciadorCanais from './components/GerenciadorCanais';
import CriarPautaManual from './components/CriarPautaManual';
import ConfiguracoesGlobaisModal from './components/ConfiguracoesGlobaisModal';
import { Video, Radio, Film, Zap, Settings, CheckCircle2, AlertCircle, X, LogOut, Loader2 } from 'lucide-react';

const NOMES_DE_REDE = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

export default function App() {
  const [activeTab, setActiveTab] = useState('manual');
  const [showSettings, setShowSettings] = useState(false);
  const [oauthResult, setOauthResult] = useState(null);
  const [operador, setOperador] = useState(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  // Firebase restores the session from storage asynchronously, so we must wait
  // before deciding whether to show the login screen.
  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setOperador(user);
      setVerificandoSessao(false);
    });
  }, []);

  // The engine's OAuth callback redirects the whole browser back here, so the
  // outcome has to be read at the app level — the modal that started the flow
  // no longer exists by the time we return.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('oauth');
    if (!outcome) return;

    setOauthResult({
      ok: outcome === 'success',
      network: params.get('network'),
      account: params.get('account'),
      message: params.get('message')
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  if (verificandoSessao) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '10px', color: 'var(--text-secondary)', fontSize: '13px'
      }}>
        <Loader2 size={18} className="text-accent" style={{ animation: 'spin 1s linear infinite' }} />
        Verificando sessão...
      </div>
    );
  }

  if (!operador) return <LoginScreen />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar Responsiva */}
      <header style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(6, 9, 12, 0.95)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div className="header-container" style={{
          maxWidth: '1380px',
          margin: '0 auto',
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo Brand */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img
                src="/logo-hermes.png"
                alt="Hermes"
                width={44}
                height={44}
                style={{
                  display: 'block',
                  borderRadius: '50%',
                  // The logo art is a neon ring on black; the glow does the
                  // lifting here instead of a background plate.
                  boxShadow: '0 0 22px rgba(0, 255, 135, 0.35)'
                }}
              />
              <div>
                <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }} className="gradient-text">
                  HERMES
                </span>
                <span style={{ fontSize: '11px', display: 'block', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
                  CASH-COW FACTORY
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs com Rolagem Horizontal para Mobile */}
          <nav className="header-nav" style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('manual')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                color: activeTab === 'manual' ? '#00ff87' : 'var(--text-secondary)',
                background: activeTab === 'manual' ? 'rgba(0, 255, 135, 0.1)' : 'transparent',
                border: activeTab === 'manual' ? '1px solid rgba(0, 255, 135, 0.4)' : '1px solid transparent',
                transition: 'all 0.25s ease'
              }}
            >
              <Film size={17} className={activeTab === 'manual' ? 'text-accent' : ''} />
              Criar Pauta & Minisséries
            </button>

            <button
              onClick={() => setActiveTab('canais')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                color: activeTab === 'canais' ? '#00ff87' : 'var(--text-secondary)',
                background: activeTab === 'canais' ? 'rgba(0, 255, 135, 0.1)' : 'transparent',
                border: activeTab === 'canais' ? '1px solid rgba(0, 255, 135, 0.4)' : '1px solid transparent',
                transition: 'all 0.25s ease'
              }}
            >
              <Radio size={17} className={activeTab === 'canais' ? 'text-accent' : ''} />
              Gerenciador de Canais
            </button>

            <button
              onClick={() => setActiveTab('monitor')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                color: activeTab === 'monitor' ? '#00ff87' : 'var(--text-secondary)',
                background: activeTab === 'monitor' ? 'rgba(0, 255, 135, 0.1)' : 'transparent',
                border: activeTab === 'monitor' ? '1px solid rgba(0, 255, 135, 0.4)' : '1px solid transparent',
                transition: 'all 0.25s ease'
              }}
            >
              <Video size={17} className={activeTab === 'monitor' ? 'text-accent' : ''} />
              Monitor de Produção Ao Vivo
            </button>
          </nav>

          {/* System Status Pill, Settings & Operator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge badge-active">
              <Zap size={12} className="text-accent" /> IA ONLINE
            </span>

            <button
              onClick={() => setShowSettings(true)}
              className="btn-secondary"
              style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Settings size={16} /> Configurações
            </button>

            <button
              onClick={() => signOut(auth)}
              className="btn-secondary"
              title={`Sair (${operador.email})`}
              style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>

      {/* Resultado do retorno do OAuth das redes sociais */}
      {oauthResult && (
        <div style={{
          maxWidth: '1380px', width: '100%', margin: '20px auto 0', padding: '0 28px'
        }}>
          <div className="glass-panel" style={{
            padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'flex-start',
            border: `1px solid ${oauthResult.ok ? 'rgba(0, 255, 135, 0.35)' : 'rgba(255, 71, 87, 0.35)'}`
          }}>
            {oauthResult.ok
              ? <CheckCircle2 size={20} style={{ color: '#00ff87', flexShrink: 0, marginTop: '2px' }} />
              : <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />}

            <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.6 }}>
              {oauthResult.ok ? (
                <>
                  <strong>{NOMES_DE_REDE[oauthResult.network] || oauthResult.network} conectado!</strong>
                  {oauthResult.account && <> Conta: {oauthResult.account}.</>}
                  {' '}Os tokens foram salvos criptografados no cofre do canal.
                </>
              ) : (
                <>
                  <strong>Falha ao conectar {NOMES_DE_REDE[oauthResult.network] || oauthResult.network}.</strong>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                    {oauthResult.message}
                  </div>
                </>
              )}
            </div>

            <button onClick={() => setOauthResult(null)} style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'
            }}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main View Container Responsivo */}
      <main className="main-content" style={{ maxWidth: '1380px', width: '100%', margin: '0 auto', padding: '32px 28px', flex: 1 }}>
        {activeTab === 'manual' && <CriarPautaManual />}
        {activeTab === 'canais' && <GerenciadorCanais />}
        {activeTab === 'monitor' && <MonitorProducao />}
      </main>

      {/* Modal de Configurações Globais */}
      {showSettings && (
        <ConfiguracoesGlobaisModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
