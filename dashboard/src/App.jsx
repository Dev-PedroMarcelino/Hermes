import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import LoginScreen from './components/LoginScreen';
import MonitorProducao from './components/MonitorProducao';
import GerenciadorCanais from './components/GerenciadorCanais';
import CriarPautaManual from './components/CriarPautaManual';
import ConfiguracoesGlobaisModal from './components/ConfiguracoesGlobaisModal';
import CriarVideoModal from './components/CriarVideoModal';
import { 
  Video, Radio, Film, Zap, Settings, CheckCircle2, AlertCircle, 
  X, LogOut, Loader2, Plus, Sparkles, LayoutDashboard, ChevronRight
} from 'lucide-react';

const NOMES_DE_REDE = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

const TAB_INFOS = {
  manual: {
    title: 'Criar Pauta & Minisséries',
    description: 'Estúdio de criação de roteiros com IA, ganchos e séries virais'
  },
  canais: {
    title: 'Gerenciador de Canais',
    description: 'Controle de canais dark, regras de IA, vozes e conexões sociais'
  },
  monitor: {
    title: 'Monitor de Produção Ao Vivo',
    description: 'Acompanhamento em tempo real da esteira autônoma da IA'
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('manual');
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [oauthResult, setOauthResult] = useState(null);
  const [operador, setOperador] = useState(null);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      setOperador(user);
      setVerificandoSessao(false);
    });
  }, []);

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
        flexDirection: 'column', gap: '14px', color: 'var(--text-secondary)', fontSize: '13px'
      }}>
        <Loader2 size={24} className="text-accent" style={{ animation: 'spin 1s linear infinite' }} />
        <span>Iniciando Hermes Factory...</span>
      </div>
    );
  }

  if (!operador) return <LoginScreen />;

  const currentTabInfo = TAB_INFOS[activeTab] || TAB_INFOS.manual;

  return (
    <div className="dashboard-layout">
      
      {/* SIDEBAR LATERAL FIXA E ELEGANTE */}
      <aside className="dashboard-sidebar">
        {/* Brand Header */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ position: 'relative' }}>
            <img
              src="/logo-hermes.png"
              alt="Hermes"
              width={38}
              height={38}
              style={{
                display: 'block',
                borderRadius: '50%',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)'
              }}
            />
            <span style={{
              position: 'absolute',
              bottom: '-1px',
              right: '-1px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid var(--bg-sidebar)'
            }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.3px' }} className="gradient-text">
                HERMES
              </span>
              <span style={{
                fontSize: '9px',
                fontWeight: 800,
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                padding: '2px 5px',
                borderRadius: '4px',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                PRO
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '1px' }}>
              Autonomous Content Engine
            </span>
          </div>
        </div>

        {/* Quick Action Button */}
        <div style={{ padding: '16px 16px 8px' }}>
          <button
            onClick={() => setShowQuickCreate(true)}
            className="gradient-btn"
            style={{
              width: '100%',
              padding: '11px 16px',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Plus size={16} /> Novo Vídeo Instantâneo
          </button>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            letterSpacing: '0.6px',
            padding: '8px 12px 4px'
          }}>
            Navegação Principal
          </span>

          <button
            onClick={() => setActiveTab('manual')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: activeTab === 'manual' ? 700 : 500,
              cursor: 'pointer',
              color: activeTab === 'manual' ? '#10b981' : 'var(--text-secondary)',
              background: activeTab === 'manual' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              border: activeTab === 'manual' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Film size={16} color={activeTab === 'manual' ? '#10b981' : 'currentColor'} />
              <span>Criar Pauta & Minissérie</span>
            </div>
            {activeTab === 'manual' && <ChevronRight size={14} opacity={0.6} />}
          </button>

          <button
            onClick={() => setActiveTab('canais')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: activeTab === 'canais' ? 700 : 500,
              cursor: 'pointer',
              color: activeTab === 'canais' ? '#10b981' : 'var(--text-secondary)',
              background: activeTab === 'canais' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              border: activeTab === 'canais' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Radio size={16} color={activeTab === 'canais' ? '#10b981' : 'currentColor'} />
              <span>Canais & Conexões</span>
            </div>
            {activeTab === 'canais' && <ChevronRight size={14} opacity={0.6} />}
          </button>

          <button
            onClick={() => setActiveTab('monitor')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '11px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: activeTab === 'monitor' ? 700 : 500,
              cursor: 'pointer',
              color: activeTab === 'monitor' ? '#10b981' : 'var(--text-secondary)',
              background: activeTab === 'monitor' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              border: activeTab === 'monitor' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Video size={16} color={activeTab === 'monitor' ? '#10b981' : 'currentColor'} />
              <span>Monitor de Produção</span>
            </div>
            {activeTab === 'monitor' && <ChevronRight size={14} opacity={0.6} />}
          </button>
        </nav>

        {/* Sidebar Footer: System Status & User Info */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Status Indicator Pill */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.18)',
            padding: '8px 12px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              Motor Autônomo
            </span>
            <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 800 }}>ATIVO</span>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
            <button
              onClick={() => setShowSettings(true)}
              className="btn-ghost"
              style={{ fontSize: '12px', padding: '6px 10px', flex: 1, justifyContent: 'flex-start' }}
            >
              <Settings size={14} /> Ajustes
            </button>

            <button
              onClick={() => signOut(auth)}
              className="btn-ghost"
              title={`Sair (${operador.email})`}
              style={{ fontSize: '12px', padding: '6px 10px', color: '#ef4444' }}
            >
              <LogOut size={14} /> Sair
            </button>
          </div>

          {/* Operator Profile Tag */}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Operador: <strong style={{ color: 'var(--text-secondary)' }}>{operador.email}</strong>
          </div>
        </div>
      </aside>

      {/* MAIN CANVAS AREA (Espaçoso, sem apertos centrais) */}
      <div className="dashboard-main">
        
        {/* Top Header Bar */}
        <header className="dashboard-header">
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentTabInfo.title}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {currentTabInfo.description}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setShowQuickCreate(true)}
              className="gradient-btn"
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              <Plus size={14} /> Criar Vídeo
            </button>
          </div>
        </header>

        {/* OAuth Return Banner */}
        {oauthResult && (
          <div style={{ padding: '20px 32px 0' }}>
            <div className="glass-panel" style={{
              padding: '14px 18px', display: 'flex', gap: '12px', alignItems: 'center',
              border: `1px solid ${oauthResult.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
              background: oauthResult.ok ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)'
            }}>
              {oauthResult.ok
                ? <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                : <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />}

              <div style={{ flex: 1, fontSize: '13px' }}>
                {oauthResult.ok ? (
                  <>
                    <strong>{NOMES_DE_REDE[oauthResult.network] || oauthResult.network} conectado com sucesso!</strong>
                    {oauthResult.account && <> Conta: <code>{oauthResult.account}</code>.</>}
                  </>
                ) : (
                  <>
                    <strong>Falha ao conectar {NOMES_DE_REDE[oauthResult.network] || oauthResult.network}:</strong> {oauthResult.message}
                  </>
                )}
              </div>

              <button onClick={() => setOauthResult(null)} className="btn-ghost" style={{ padding: '4px' }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="dashboard-content">
          {activeTab === 'manual' && <CriarPautaManual />}
          {activeTab === 'canais' && <GerenciadorCanais />}
          {activeTab === 'monitor' && <MonitorProducao />}
        </main>
      </div>

      {/* Modal de Configurações Globais */}
      {showSettings && (
        <ConfiguracoesGlobaisModal onClose={() => setShowSettings(false)} />
      )}

      {/* Modal de Criação Rápida */}
      {showQuickCreate && (
        <CriarVideoModal onClose={() => setShowQuickCreate(false)} />
      )}
    </div>
  );
}
