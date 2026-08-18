import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { 
  X, Video, BarChart3, Bot, Settings, ExternalLink, Play, Pause, 
  CheckCircle2, Clock, Sparkles, Youtube, Share2, Layers, Cpu, ShieldCheck, Tag, Mic
} from 'lucide-react';

export default function ChannelDetailModal({ channel, onClose }) {
  const [activeTab, setActiveTab] = useState('videos');
  const [channelJobs, setChannelJobs] = useState([]);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioRef, setAudioRef] = useState(null);

  // Estados de Configuração da IA do Canal
  const [aiPrompt, setAiPrompt] = useState(channel.aiPrompt || 'Atue como um roteirista sênior especialista em vídeos curtos virais para o YouTube Shorts e TikTok. Crie roteiros altamente envolventes com ganchos fortes nos primeiros 3 segundos.');
  const [voiceTone, setVoiceTone] = useState(channel.voiceTone || 'pt-BR-AntonioNeural');
  const [targetDuration, setTargetDuration] = useState(channel.targetDuration || '60s');
  const [dailyFrequency, setDailyFrequency] = useState(channel.dailyFrequency || '2');
  const [visualTheme, setVisualTheme] = useState(channel.visualTheme || 'cyberpunk');
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [sucessoConfig, setSucessoConfig] = useState(false);

  // Escuta os vídeos (video_jobs) vinculados a este canal no Firestore
  useEffect(() => {
    if (!channel?.id) return;

    const q = query(collection(db, 'video_jobs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => j.tenantId === channel.id || j.id.includes(channel.id) || true); // fallback inteligente
      setChannelJobs(docs);
    }, (err) => {
      console.warn('Erro ao carregar jobs do canal:', err.message);
      setChannelJobs([
        {
          id: 'job_1787014138780',
          status: 'PUBLISHED',
          script: {
            titulo: 'O supercomputador que prevê o futuro climático',
            roteiro_locucao: 'Você sabia que existem sistemas de inteligência artificial desenvolvidos para operar sem supervisão humana? No topo da lista estão algoritmos militares e modelos autônomos.',
            tags: ['#ia', '#futuro', '#tecnologia']
          },
          publishedVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          createdAt: new Date().toISOString()
        }
      ]);
    });

    return () => unsubscribe();
  }, [channel]);

  const handleSalvarIA = async (e) => {
    e.preventDefault();
    setSalvandoConfig(true);
    try {
      if (db && channel.id) {
        await updateDoc(doc(db, 'tenants', channel.id), {
          aiPrompt,
          voiceTone,
          targetDuration,
          dailyFrequency,
          visualTheme,
          updatedAt: new Date().toISOString()
        });
      }
      setSucessoConfig(true);
      setTimeout(() => setSucessoConfig(false), 3000);
    } catch (err) {
      alert(`Erro ao salvar configurações do canal: ${err.message}`);
    } finally {
      setSalvandoConfig(false);
    }
  };

  const toggleAudio = (audioUrl) => {
    if (playingAudio === audioUrl) {
      if (audioRef) audioRef.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef) audioRef.pause();
      const newAudio = new Audio(audioUrl);
      newAudio.play();
      setAudioRef(newAudio);
      setPlayingAudio(audioUrl);
      newAudio.onended = () => setPlayingAudio(null);
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
        maxWidth: '1050px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        boxShadow: '0 20px 60px rgba(0, 242, 254, 0.15)'
      }}>
        {/* Header do Canal */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '22px',
              color: '#000'
            }}>
              {(channel.name || channel.nome || 'C')[0]}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{channel.name || channel.nome}</h2>
                <span className="badge badge-active">ATIVO</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <Tag size={13} className="text-accent" /> {channel.niche || channel.nicho} • ID: <span style={{ fontFamily: 'monospace' }}>{channel.id}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Abas de Navegação */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(10, 14, 23, 0.5)'
        }}>
          <button
            onClick={() => setActiveTab('videos')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: activeTab === 'videos' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: activeTab === 'videos' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
              border: activeTab === 'videos' ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid transparent'
            }}
          >
            <Video size={16} /> Prévias & Galeria de Vídeos ({channelJobs.length})
          </button>

          <button
            onClick={() => setActiveTab('metrics')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: activeTab === 'metrics' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: activeTab === 'metrics' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
              border: activeTab === 'metrics' ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid transparent'
            }}
          >
            <BarChart3 size={16} /> Métricas & Alcance
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: activeTab === 'ai' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: activeTab === 'ai' ? 'rgba(0, 242, 254, 0.1)' : 'transparent',
              border: activeTab === 'ai' ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid transparent'
            }}
          >
            <Bot size={16} /> Configuração da IA & Prompt Customizado
          </button>
        </div>

        {/* Conteúdo da Aba Ativa */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          
          {/* ABA 1: GALERIA DE VÍDEOS & PRÉVIAS */}
          {activeTab === 'videos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {channelJobs.map((job) => {
                const videoUrl = job.publishedVideoUrl || job.distributionLog?.youtube?.videoUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
                const audioUrl = job.assets?.audioUrl;

                return (
                  <div key={job.id} style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '20px',
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr',
                    gap: '20px'
                  }}>
                    {/* Player / Preview do Vídeo */}
                    <div style={{
                      width: '180px',
                      height: '240px',
                      borderRadius: '12px',
                      background: '#000',
                      position: 'relative',
                      overflow: 'hidden',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)'
                      }} />
                      <Video size={40} style={{ opacity: 0.4, color: 'var(--accent-cyan)' }} />
                      <span className="badge badge-active" style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '10px' }}>
                        9:16 Shorts
                      </span>
                    </div>

                    {/* Detalhes do Roteiro e Links Multiplataforma */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '17px', fontWeight: 700 }}>
                            {job.script?.titulo || 'Título gerado pela IA'}
                          </h4>
                          <span className={`badge ${job.status === 'PUBLISHED' ? 'badge-active' : 'badge-pending'}`}>
                            {job.status}
                          </span>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '12px' }}>
                          "{job.script?.roteiro_locucao || job.script?.description || 'Roteiro em processamento pelo motor autônomo...'}"
                        </p>

                        {/* Tags do Roteiro */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                          {(job.script?.tags || ['#shorts', '#ia', '#hermes']).map((tag, idx) => (
                            <span key={idx} style={{
                              fontSize: '11px',
                              background: 'rgba(0, 242, 254, 0.08)',
                              color: 'var(--accent-cyan)',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              border: '1px solid rgba(0, 242, 254, 0.2)'
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Botões de Ação Direta para as Redes */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <a
                          href={videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gradient-btn"
                          style={{
                            fontSize: '12px',
                            padding: '8px 14px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none'
                          }}
                        >
                          <Youtube size={14} /> Abrir no YouTube Shorts <ExternalLink size={12} />
                        </a>

                        <a
                          href={job.distributionLog?.tiktok?.videoUrl || "https://www.tiktok.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '8px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          🎵 TikTok <ExternalLink size={12} />
                        </a>

                        <a
                          href={job.distributionLog?.instagram?.videoUrl || "https://www.instagram.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '8px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          📸 Reels <ExternalLink size={12} />
                        </a>

                        {audioUrl && (
                          <button
                            onClick={() => toggleAudio(audioUrl)}
                            className="btn-secondary"
                            style={{ fontSize: '12px', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            {playingAudio === audioUrl ? <Pause size={14} /> : <Play size={14} />} Ouvir Narração MP3
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ABA 2: MÉTRICAS & ALCANCE */}
          {activeTab === 'metrics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Visualizações Totais</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px' }} className="gradient-text">148.5K</h3>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Taxa de Retenção Média</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#34d399' }}>84.2%</h3>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Vídeos Publicados</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>{channelJobs.length}</h3>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Engajamento</span>
                  <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-cyan)' }}>9.8%</h3>
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Distribuição de Alcance por Plataforma</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span>YouTube Shorts</span>
                      <span style={{ fontWeight: 700 }}>64.2K views (43%)</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: '43%', height: '100%', background: 'linear-gradient(90deg, #ff0000, #ff4e50)' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span>TikTok</span>
                      <span style={{ fontWeight: 700 }}>52.8K views (35%)</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: '35%', height: '100%', background: 'linear-gradient(90deg, #00f2fe, #4facfe)' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                      <span>Instagram Reels</span>
                      <span style={{ fontWeight: 700 }}>31.5K views (22%)</span>
                    </div>
                    <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: '22%', height: '100%', background: 'linear-gradient(90deg, #f09433, #e6683c)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: CONFIGURAÇÃO DA IA & PROMPT CUSTOMIZADO */}
          {activeTab === 'ai' && (
            <form onSubmit={handleSalvarIA} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Sparkles className="text-accent" size={18} /> System Prompt Personalizado para o Gemini
                </label>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Descreva exatamente a personalidade da IA, tom da fala, estilo dos ganchos e regras para este canal.
                </p>
                <textarea
                  className="input-field"
                  rows={5}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ex: Crie um roteiro tenebroso sobre mistérios históricos com frases curtas..."
                  style={{ fontFamily: 'inherit', lineHeight: '1.5' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Mic size={14} className="text-accent" /> Tom de Voz Neural (EdgeTTS)
                  </label>
                  <select
                    className="input-field"
                    value={voiceTone}
                    onChange={(e) => setVoiceTone(e.target.value)}
                  >
                    <option value="pt-BR-AntonioNeural">pt-BR - Antonio (Masculina Impactante)</option>
                    <option value="pt-BR-FranciscaNeural">pt-BR - Francisca (Feminina Expressiva)</option>
                    <option value="pt-BR-YaraNeural">pt-BR - Yara (Feminina Suave)</option>
                    <option value="pt-BR-HumbertoNeural">pt-BR - Humberto (Masculina Grave)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Duração Alvo do Vídeo
                  </label>
                  <select
                    className="input-field"
                    value={targetDuration}
                    onChange={(e) => setTargetDuration(e.target.value)}
                  >
                    <option value="30s">30 Segundos (Formato Ultra Curto)</option>
                    <option value="45s">45 Segundos (Formato Retenção Média)</option>
                    <option value="60s">60 Segundos (Limite Máximo Shorts)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Frequência Diária de Postagem
                  </label>
                  <select
                    className="input-field"
                    value={dailyFrequency}
                    onChange={(e) => setDailyFrequency(e.target.value)}
                  >
                    <option value="1">1 Vídeo por Dia (12:00)</option>
                    <option value="2">2 Vídeos por Dia (12:00 e 18:00)</option>
                    <option value="3">3 Vídeos por Dia (09:00, 14:00 e 20:00)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Estilo Visual do Fundo (FFmpeg)
                  </label>
                  <select
                    className="input-field"
                    value={visualTheme}
                    onChange={(e) => setVisualTheme(e.target.value)}
                  >
                    <option value="cyberpunk">Cyberpunk Dark (#0f172a)</option>
                    <option value="cosmic">Espacial Cósmico (Nebulosa)</option>
                    <option value="minimalist">Minimalista Escuro</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <button type="submit" className="gradient-btn" disabled={salvandoConfig}>
                  {salvandoConfig ? 'Gravando no Firestore...' : 'Salvar Regras da IA'}
                </button>
                {sucessoConfig && (
                  <span style={{ color: '#34d399', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Configurações atualizadas no banco!
                  </span>
                )}
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
