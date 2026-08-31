import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import ChannelDetailModal from './ChannelDetailModal';
import {
  Plus, Radio, Tag, Sparkles, Sliders, ArrowRight, Eye, Youtube,
  Share2, Layers, CheckCircle2, ChevronDown, ChevronUp, Mic, Globe
} from 'lucide-react';

export default function GerenciadorCanais() {
  const [canais, setCanais] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [showNovoCanal, setShowNovoCanal] = useState(false);

  // Formulário de Novo Canal
  const [nome, setNome] = useState('');
  const [nicho, setNicho] = useState('');
  const [publicoAlvo, setPublicoAlvo] = useState('Jovens e Adultos (18-35 anos)');
  const [tomVoz, setTomVoz] = useState('pt-BR-FranciscaNeural');
  const [promptIA, setPromptIA] = useState('Atue como um especialista em vídeos curtos virais com ganchos misteriosos.');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCanais(lista);
    }, (error) => {
      console.warn('Erro Firestore listeners:', error.message);
      setCanais([
        {
          id: 'tenant_test_1787011929715',
          name: 'Curiosidades Tech & IA',
          niche: 'Tecnologia & Futuro',
          status: 'ACTIVE',
          aiPrompt: 'Crie roteiros curtos sobre inteligência artificial com ganchos dinâmicos.',
          voiceTone: 'pt-BR-FranciscaNeural'
        },
        {
          id: 'tenant_02',
          name: 'Mundo Obscuro',
          niche: 'Mistérios & História',
          status: 'ACTIVE',
          aiPrompt: 'Crie roteiros sobre fatos misteriosos da história.',
          voiceTone: 'pt-BR-HumbertoNeural'
        }
      ]);
    });

    return () => unsubscribe();
  }, []);

  const handleSalvarCanal = async (e) => {
    e.preventDefault();
    if (!nome.trim() || !nicho.trim()) return;

    setSalvando(true);
    try {
      const novoCanal = {
        name: nome.trim(),
        niche: nicho.trim(),
        targetAudience: publicoAlvo,
        voiceTone: tomVoz,
        aiPrompt: promptIA.trim(),
        status: 'ACTIVE',
        language: 'pt-BR',
        createdAt: new Date().toISOString()
      };

      if (db) {
        await addDoc(collection(db, 'tenants'), novoCanal);
      }
      setNome('');
      setNicho('');
      setPromptIA('');
      setShowNovoCanal(false);
    } catch (err) {
      alert(`Erro ao adicionar canal: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Top Banner de Métricas & Ação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Canais Dark & Workspaces
          </h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Gerencie identidades visuais, vozes e contas vinculadas para cada canal
          </span>
        </div>

        <button
          onClick={() => setShowNovoCanal(!showNovoCanal)}
          className="gradient-btn"
          style={{ padding: '10px 18px', fontSize: '13px' }}
        >
          {showNovoCanal ? <ChevronUp size={16} /> : <Plus size={16} />}
          {showNovoCanal ? 'Recolher Formulário' : 'Cadastrar Novo Canal'}
        </button>
      </div>

      {/* Formulário Retrátil de Novo Canal */}
      {showNovoCanal && (
        <div className="glass-panel tech-card" style={{ padding: '24px' }}>
          <div style={{ marginBottom: '18px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 800 }}>Novo Canal Autônomo</h4>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Defina as regras da IA e a voz neural que serão usadas nos vídeos deste canal
            </span>
          </div>

          <form onSubmit={handleSalvarCanal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Nome do Canal
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Mistérios do Universo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Nicho Principal
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: Curiosidades & Ciência"
                  value={nicho}
                  onChange={(e) => setNicho(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Voz Neural Padrão
                </label>
                <select
                  className="input-field"
                  value={tomVoz}
                  onChange={(e) => setTomVoz(e.target.value)}
                >
                  <optgroup label="✨ ElevenLabs (Ultra-Realistas)">
                    <option value="elevenlabs:pNInz6obpgDQGcFmaJgB">ElevenLabs - Adam (Masculina Profunda)</option>
                    <option value="elevenlabs:21m00Tcm4TlvDq8ikWAM">ElevenLabs - Rachel (Feminina Narrativa)</option>
                    <option value="elevenlabs:ErXwobaYiN019PkySvjV">ElevenLabs - Antoni (Masculina Jovem)</option>
                    <option value="elevenlabs:EXAVITQu4vr4xnSDxMaL">ElevenLabs - Bella (Feminina Expressiva)</option>
                  </optgroup>
                  <optgroup label="⚡ EdgeTTS (Gratuitas)">
                    <option value="pt-BR-FranciscaNeural">pt-BR - Francisca (Feminina Expressiva)</option>
                    <option value="pt-BR-YaraNeural">pt-BR - Yara (Feminina Suave)</option>
                    <option value="pt-BR-HumbertoNeural">pt-BR - Humberto (Masculina Grave)</option>
                    <option value="pt-BR-FabioNeural">pt-BR - Fabio (Masculina)</option>
                    <option value="pt-BR-AntonioNeural">pt-BR - Antonio (Masculina Padrão)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Sparkles size={13} className="text-accent" /> Prompt / Instrução da IA para este Canal
              </label>
              <textarea
                className="input-field"
                rows={2}
                placeholder="Descreva a personalidade da IA, tom de fala e dinâmica dos roteiros..."
                value={promptIA}
                onChange={(e) => setPromptIA(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowNovoCanal(false)}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '12px' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="gradient-btn"
                disabled={salvando}
                style={{ padding: '8px 20px', fontSize: '12px' }}
              >
                {salvando ? 'Salvando...' : 'Salvar Canal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid Fluido de Cards de Canais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {canais.map((canal) => {
          const conexoes = canal.conexoes || {};
          const hasYoutube = conexoes.youtube?.status === 'CONNECTED';
          const hasTiktok = conexoes.tiktok?.status === 'CONNECTED';
          const hasInstagram = conexoes.instagram?.status === 'CONNECTED';

          return (
            <div
              key={canal.id}
              onClick={() => setSelectedChannel(canal)}
              className="glass-panel"
              style={{
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                position: 'relative'
              }}
            >
              {/* Header do Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '18px',
                    color: '#06090c'
                  }}>
                    {(canal.name || canal.nome || 'C')[0]}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {canal.name || canal.nome}
                    </h4>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {canal.niche || canal.nicho}
                    </span>
                  </div>
                </div>

                <span className="badge badge-active" style={{ fontSize: '10px' }}>ATIVO</span>
              </div>

              {/* Regra de IA Resumida */}
              <div style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                background: 'var(--bg-input)',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                lineHeight: 1.4
              }}>
                💬 "{canal.aiPrompt ? (canal.aiPrompt.substring(0, 85) + '...') : 'Configuração padrão ativada'}"
              </div>

              {/* Status de Redes Sociais Conectadas */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Redes:</span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                  background: hasYoutube ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: hasYoutube ? '#ef4444' : 'var(--text-muted)',
                  border: hasYoutube ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)'
                }}>
                  YouTube {hasYoutube ? '✓' : '—'}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                  background: hasTiktok ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: hasTiktok ? '#06b6d4' : 'var(--text-muted)',
                  border: hasTiktok ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid var(--border-subtle)'
                }}>
                  TikTok {hasTiktok ? '✓' : '—'}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                  background: hasInstagram ? 'rgba(244, 114, 182, 0.15)' : 'rgba(255,255,255,0.03)',
                  color: hasInstagram ? '#f472b6' : 'var(--text-muted)',
                  border: hasInstagram ? '1px solid rgba(244, 114, 182, 0.3)' : '1px solid var(--border-subtle)'
                }}>
                  Instagram {hasInstagram ? '✓' : '—'}
                </span>
              </div>

              {/* Botão de Entrada */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: '12px', borderTop: '1px solid var(--border-subtle)',
                fontSize: '12px', color: '#10b981', fontWeight: 700
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Eye size={13} /> Abrir Sala de Controle
                </span>
                <ArrowRight size={15} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Workspace do Canal Selecionado */}
      {selectedChannel && (
        <ChannelDetailModal
          channel={selectedChannel}
          onClose={() => setSelectedChannel(null)}
        />
      )}
    </div>
  );
}
