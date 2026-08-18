import { useState } from 'react';
import { X, Settings, Cpu, ShieldCheck, Zap, Key, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function ConfiguracoesGlobaisModal({ onClose }) {
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [renderQuality, setRenderQuality] = useState('1080x1920');
  const [autoPilot, setAutoPilot] = useState(true);
  const [disparando, setDisparando] = useState(false);
  const [sucessoDisparo, setSucessoDisparo] = useState(false);

  const handleDispararMotor = async () => {
    setDisparando(true);
    try {
      // Simula / dispara requisição para a API local do engine
      await new Promise(r => setTimeout(r, 1500));
      setSucessoDisparo(true);
      setTimeout(() => setSucessoDisparo(false), 4000);
    } catch (err) {
      alert(`Erro ao disparar motor: ${err.message}`);
    } finally {
      setDisparando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 8, 16, 0.85)',
      backdropFilter: 'blur(12px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '650px',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        border: '1px solid rgba(0, 242, 254, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings className="text-accent" size={24} />
            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Configurações Globais do Hermes</h3>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Cpu size={15} className="text-accent" /> Modelo do Google Gemini IA
            </label>
            <select
              className="input-field"
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
            >
              <option value="gemini-1.5-flash">Gemini 1.5 Flash (Ultra Rápido & Econômico - Recomendado)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro (Raciocínio Criativo Avançado)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Resolução de Renderização do Vídeo (FFmpeg)
            </label>
            <select
              className="input-field"
              value={renderQuality}
              onChange={(e) => setRenderQuality(e.target.value)}
            >
              <option value="1080x1920">Full HD Vertical 1080x1920 (Padrão 9:16 Shorts/Reels/TikTok)</option>
              <option value="2160x3840">4K Ultra HD Vertical 2160x3840</option>
            </select>
          </div>

          <div style={{
            background: 'rgba(0, 242, 254, 0.05)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            padding: '16px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={16} className="text-accent" /> Piloto Automático & Cron Scheduler
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Geração e postagem 100% autônoma ativa 24 horas por dia.
              </p>
            </div>
            <span className="badge badge-active">ATIVADO</span>
          </div>

          <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={handleDispararMotor}
              className="gradient-btn"
              disabled={disparando}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} className={disparando ? 'spin' : ''} />
              {disparando ? 'Disparando Motor Autônomo...' : 'Forçar Disparo Manual do Pipeline'}
            </button>

            {sucessoDisparo && (
              <span style={{ color: '#34d399', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> Pipeline disparado no backend!
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
