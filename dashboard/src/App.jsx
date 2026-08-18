import { useState } from 'react';
import MonitorProducao from './components/MonitorProducao';
import GerenciadorCanais from './components/GerenciadorCanais';
import CriarPautaManual from './components/CriarPautaManual';
import ConfiguracoesGlobaisModal from './components/ConfiguracoesGlobaisModal';
import { Video, Radio, Film, Zap, Settings, Cpu } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('manual');
  const [showSettings, setShowSettings] = useState(false);

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
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #00ff87, #14a76c)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#06090c',
                boxShadow: '0 0 20px rgba(0, 255, 135, 0.5)'
              }}>
                <Cpu size={22} color="#06090c" />
              </div>
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

          {/* System Status Pill & Settings */}
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
          </div>
        </div>
      </header>

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
