import { useState } from 'react';
import MonitorProducao from './components/MonitorProducao';
import GerenciadorCanais from './components/GerenciadorCanais';
import ConfiguracoesGlobaisModal from './components/ConfiguracoesGlobaisModal';
import { Layers, Video, Radio, Zap, Settings, ShieldCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('canais'); // Padrão no Gerenciador de Canais
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar */}
      <header style={{
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(9, 13, 22, 0.9)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1350px',
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00f2fe, #7f00ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '20px',
              color: '#fff',
              boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)'
            }}>
              H
            </div>
            <div>
              <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }} className="gradient-text">
                HERMES
              </span>
              <span style={{ fontSize: '11px', display: 'block', color: 'var(--text-secondary)' }}>
                OmniChannel Content Factory
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('canais')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'canais' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                background: activeTab === 'canais' ? 'rgba(0, 242, 254, 0.08)' : 'transparent',
                border: activeTab === 'canais' ? '1px solid rgba(0, 242, 254, 0.25)' : '1px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              <Radio size={18} />
              Gerenciador de Canais & IA
            </button>

            <button
              onClick={() => setActiveTab('monitor')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                color: activeTab === 'monitor' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                background: activeTab === 'monitor' ? 'rgba(0, 242, 254, 0.08)' : 'transparent',
                border: activeTab === 'monitor' ? '1px solid rgba(0, 242, 254, 0.25)' : '1px solid transparent',
                transition: 'all 0.2s ease'
              }}
            >
              <Video size={18} />
              Monitor de Produção Ao Vivo
            </button>
          </nav>

          {/* System Status Pill & Global Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-active">
              <Zap size={12} /> Motor Autônomo Ativo
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

      {/* Main Content View */}
      <main style={{ maxWidth: '1350px', width: '100%', margin: '0 auto', padding: '32px 24px', flex: 1 }}>
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
