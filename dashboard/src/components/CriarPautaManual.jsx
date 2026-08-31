import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Sparkles, Layers, Film, CheckCircle2, Zap, Cpu, AlertCircle,
  Image as ImageIcon, Rocket, Lightbulb, TrendingUp, HelpCircle
} from 'lucide-react';
import { triggerVideoJob } from '../lib/engineApi';
import CriarVideoModal from './CriarVideoModal';

export default function CriarPautaManual() {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tema, setTema] = useState('');
  const [descricao, setDescricao] = useState('');
  const [mediaTypePreference, setMediaTypePreference] = useState('google_image');
  const [isMiniseries, setIsMiniseries] = useState(false);
  const [quantidadePartes, setQuantidadePartes] = useState('3');
  const [salvando, setSalvando] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState(null);
  const [erroMsg, setErroMsg] = useState(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCanais(lista);
      if (lista.length > 0 && !selectedTenant) {
        setSelectedTenant(lista[0].id);
      }
    }, (err) => {
      console.warn('Erro ao carregar canais:', err.message);
      setCanais([{ id: 'tenant_test_1787011929715', name: 'Curiosidades Tech & IA' }]);
      setSelectedTenant('tenant_test_1787011929715');
    });

    return () => unsubscribe();
  }, []);

  const handleCriarPauta = async (e) => {
    e.preventDefault();
    if (!tema.trim() || !selectedTenant) return;

    setSalvando(true);
    setSucessoMsg(null);
    setErroMsg(null);

    try {
      if (isMiniseries) {
        const numPartes = parseInt(quantidadePartes, 10);

        for (let i = 1; i <= numPartes; i++) {
          const isLast = i === numPartes;
          const instruction = [
            `Este é o episódio ${i} de uma minissérie de ${numPartes} partes sobre "${tema.trim()}".`,
            `Inclua "Parte ${i}" no título.`,
            'Abra com um gancho forte nos primeiros 3 segundos.',
            isLast
              ? 'Encerre com uma conclusão satisfatória e um convite para se inscrever no canal.'
              : `Encerre obrigatoriamente com um cliffhanger dramático chamando o público para a Parte ${i + 1}.`,
            descricao.trim()
          ].filter(Boolean).join(' ');

          await triggerVideoJob({
            tenantId: selectedTenant,
            customTopic: tema.trim(),
            customInstruction: instruction,
            mediaTypePreference
          });
        }

        setSucessoMsg(`Minissérie de ${numPartes} partes enfileirada com sucesso!`);
      } else {
        const { jobId } = await triggerVideoJob({
          tenantId: selectedTenant,
          customTopic: tema.trim(),
          customInstruction: descricao.trim() || null,
          mediaTypePreference
        });
        setSucessoMsg(`Job ${jobId} enfileirado com sucesso! Acompanhe no Monitor.`);
      }

      setTema('');
      setDescricao('');
      setTimeout(() => setSucessoMsg(null), 6000);
    } catch (err) {
      setErroMsg(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const canalAtual = canais.find(c => c.id === selectedTenant);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '28px' }}>
      
      {/* Coluna Principal: Formulário de Criação Studio */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '28px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Criar Nova Pauta ou Roteiro
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                A IA do Gemini vai estruturar o gancho, roteiro dinâmico, narração e imagens
              </p>
            </div>

            <span className="badge badge-active">
              <Sparkles size={12} /> GEMINI AI
            </span>
          </div>

          <form onSubmit={handleCriarPauta} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Linha 1: Canal & Tema */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Layers size={13} className="text-accent" /> Canal Destino
                </label>
                <select
                  className="input-field"
                  value={selectedTenant}
                  onChange={(e) => setSelectedTenant(e.target.value)}
                  required
                >
                  {canais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.nome} ({c.niche || c.nicho})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <Sparkles size={13} className="text-accent" /> Assunto / Pauta do Vídeo
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ex: A Descoberta Secreta sob o Gelo da Antártida"
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Linha 2: Descrição / Instruções Específicas */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Cpu size={13} className="text-accent" /> Direção Criativa & Detalhes (Opcional)
              </label>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Ex: Focar em tom misterioso, usar fatos chocantes e dar ênfase na retenção dos primeiros 5 segundos..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            {/* Seletor de Estilo de Mídia de Fundo */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Film size={13} className="text-accent" /> Estilo das Mídias de Fundo
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                {[
                  { id: 'web_video', label: '🌐 Vídeos da Web (≤10s)', desc: 'Clipes reais da internet' },
                  { id: 'google_image', label: '📷 Fotos Reais Web', desc: 'Google Imagens + Motion' },
                  { id: 'ai_image', label: '🎨 Arte IA (Flux 9:16)', desc: 'Ilustração cinematográfica' },
                  { id: 'pexels', label: '🎬 Stock Pexels', desc: 'Apenas Natureza e Cidades' }
                ].map(opt => {
                  const isSelected = mediaTypePreference === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMediaTypePreference(opt.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-input)',
                        border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}`,
                        color: isSelected ? '#10b981' : 'var(--text-secondary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Painel de Minissérie */}
            <div style={{
              background: isMiniseries ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-card-subtle)',
              border: `1px solid ${isMiniseries ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}`,
              padding: '18px 20px',
              borderRadius: '12px',
              transition: 'all 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isMiniseries}
                    onChange={(e) => setIsMiniseries(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: isMiniseries ? '#10b981' : 'var(--text-primary)' }}>
                      Dividir em Minissérie Encadeada (Cliffhangers)
                    </span>
                    <span style={{ fontSize: '12px', display: 'block', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Cria episódios conectados que incentivam o público a assistir a próxima parte
                    </span>
                  </div>
                </label>

                {isMiniseries && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Partes:</span>
                    <select
                      className="input-field"
                      style={{ width: '140px', padding: '6px 10px', fontSize: '12px' }}
                      value={quantidadePartes}
                      onChange={(e) => setQuantidadePartes(e.target.value)}
                    >
                      <option value="2">2 Episódios</option>
                      <option value="3">3 Episódios</option>
                      <option value="5">5 Episódios</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {erroMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
                padding: '12px 14px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center'
              }}>
                <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#fca5a5' }}>{erroMsg}</span>
              </div>
            )}

            {sucessoMsg && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '12px 14px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center'
              }}>
                <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#6ee7b7', fontWeight: 600 }}>{sucessoMsg}</span>
              </div>
            )}

            {/* Ações do Formulário */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                disabled={!tema.trim()}
                className="btn-secondary"
                style={{
                  padding: '11px 20px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.08)',
                  borderColor: 'rgba(16, 185, 129, 0.3)'
                }}
              >
                {mediaTypePreference === 'web_video' || mediaTypePreference === 'pexels' ? (
                  <>
                    <Film size={16} /> Ver Prévia de Vídeos da Web
                  </>
                ) : mediaTypePreference === 'ai_image' ? (
                  <>
                    <Sparkles size={16} /> Ver Prévia de Arte IA
                  </>
                ) : (
                  <>
                    <ImageIcon size={16} /> Ver Prévia de Fotos Reais
                  </>
                )}
              </button>

              <button
                type="submit"
                className="gradient-btn"
                disabled={salvando || !tema.trim()}
                style={{ padding: '11px 24px', fontSize: '13px' }}
              >
                <Rocket size={16} />
                {salvando ? 'Enfileirando...' : isMiniseries ? `Gerar Minissérie (${quantidadePartes} partes)` : 'Iniciar Produção'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Coluna Lateral: Playbook de Retenção & Dados do Canal */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Card Canal Selecionado */}
        {canalAtual && (
          <div className="glass-panel" style={{ padding: '20px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              Canal em Foco
            </span>
            <h4 style={{ fontSize: '16px', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)' }}>
              {canalAtual.name || canalAtual.nome}
            </h4>
            <span style={{ fontSize: '12px', color: '#10b981', display: 'block', marginTop: '2px' }}>
              Nicho: {canalAtual.niche || canalAtual.nicho}
            </span>

            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Voz Neural:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {canalAtual.voiceTone?.replace('elevenlabs:', '✨ ElevenLabs ') || 'pt-BR-AntonioNeural'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Duração Alvo:</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {canalAtual.targetDuration || '60s (Shorts)'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Card de Boas Práticas da Fábrica */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={16} className="text-accent" />
            <h4 style={{ fontSize: '14px', fontWeight: 800 }}>Dicas para Vídeos Virais</h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#10b981', fontWeight: 700 }}>01.</span>
              <span><strong>Gancho Instantâneo:</strong> A primeira frase deve criar uma curiosidade imediata para reter a atenção.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#10b981', fontWeight: 700 }}>02.</span>
              <span><strong>Minisséries & Cliffhangers:</strong> Dividir temas em 3 partes aumenta drasticamente as visitas no perfil.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#10b981', fontWeight: 700 }}>03.</span>
              <span><strong>Legendas Dinâmicas:</strong> O Hermes sincroniza palavras em karaoke para maximizar a retenção visual.</span>
            </div>
          </div>
        </div>

      </div>

      {showPreview && (
        <CriarVideoModal
          onClose={() => setShowPreview(false)}
          initialTenantId={selectedTenant}
          initialTopic={tema}
          initialInstruction={descricao}
        />
      )}
    </div>
  );
}
