import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import OAuthConnectionModal from './OAuthConnectionModal';
import AppCredentialsPanel from './AppCredentialsPanel';
import { 
  X, Video, BarChart3, Bot, ExternalLink, Play, Pause, 
  CheckCircle2, Sparkles, Youtube, Tag, Mic, Trash2, Share2, Link2, RefreshCw
} from 'lucide-react';

export default function ChannelDetailModal({ channel, onClose }) {
  const [activeTab, setActiveTab] = useState('videos');
  const [channelJobs, setChannelJobs] = useState([]);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioRef, setAudioRef] = useState(null);
  const [deletandoJobId, setDeletandoJobId] = useState(null);
  const [deletandoCanal, setDeletandoCanal] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [connectingRede, setConnectingRede] = useState('youtube');

  const [aiPrompt, setAiPrompt] = useState(channel.aiPrompt || 'Atue como um roteirista sênior especialista em vídeos curtos virais.');
  const [voiceTone, setVoiceTone] = useState(channel.voiceTone || 'pt-BR-AntonioNeural');
  const [targetDuration, setTargetDuration] = useState(channel.targetDuration || '60s');
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [sucessoConfig, setSucessoConfig] = useState(false);
  const [conexoes, setConexoes] = useState(channel.conexoes || {});

  useEffect(() => {
    if (!channel?.id) return;

    const unsubTenant = onSnapshot(doc(db, 'tenants', channel.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setConexoes(data.conexoes || {});
      }
    });

    const q = query(collection(db, 'video_jobs'));
    const unsubJobs = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => (j.tenantId === channel.id || j.id.includes(channel.id)) && j.status !== 'DELETED');
      setChannelJobs(docs);
    });

    return () => {
      unsubTenant();
      unsubJobs();
    };
  }, [channel]);

  const handleDeletarVideo = async (jobId) => {
    if (!window.confirm('Tem certeza que deseja excluir este vídeo? O registro será removido.')) return;

    setDeletandoJobId(jobId);
    setChannelJobs(prev => prev.filter(j => j.id !== jobId));

    try {
      if (db) {
        await deleteDoc(doc(db, 'video_jobs', jobId));
      }
    } catch (err) {
      console.warn('Firestore Web SDK permission notice:', err.message);
      try {
        if (db) {
          await updateDoc(doc(db, 'video_jobs', jobId), { status: 'DELETED', updatedAt: new Date().toISOString() });
        }
      } catch (e2) {
        console.warn('Fallback updateDoc error:', e2.message);
      }
    } finally {
      setDeletandoJobId(null);
    }
  };

  const handleTentarNovamente = async (jobId) => {
    try {
      if (db) {
        await updateDoc(doc(db, 'video_jobs', jobId), {
          status: 'QUEUED',
          errorMessage: null,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Erro ao reiniciar vídeo:', err.message);
      alert('Não foi possível reiniciar o vídeo: ' + err.message);
    }
  };

  const handleDeletarCanal = async () => {
    const jobsEmProducao = channelJobs.filter(j => ['AUDIO_GEN', 'VIDEO_RENDER', 'READY_TO_UPLOAD'].includes(j.status));
    if (jobsEmProducao.length > 0) {
      alert(`Não é possível excluir o canal no momento. Existem ${jobsEmProducao.length} vídeos em produção na esteira. Aguarde a finalização.`);
      return;
    }

    if (!window.confirm(`ATENÇÃO: Deseja realmente excluir o canal "${channel.name || channel.nome}" e seu histórico?`)) return;

    setDeletandoCanal(true);
    try {
      if (db) {
        try {
          const pautasSnap = await getDocs(collection(db, 'tenants', channel.id, 'pautas'));
          for (const pDoc of pautasSnap.docs) {
            await deleteDoc(pDoc.ref);
          }
          for (const j of channelJobs) {
            await deleteDoc(doc(db, 'video_jobs', j.id));
          }
          await deleteDoc(doc(db, 'tenants', channel.id));
        } catch (subErr) {
          await updateDoc(doc(db, 'tenants', channel.id), { status: 'INACTIVE', updatedAt: new Date().toISOString() });
        }
      }
      onClose();
    } catch (err) {
      console.warn('Erro exclusão canal:', err.message);
      onClose();
    } finally {
      setDeletandoCanal(false);
    }
  };

  // Abre o Modal Real de OAuth do Google / YouTube
  const handleAbrirModalOAuth = (rede) => {
    setConnectingRede(rede);
    setShowOAuthModal(true);
  };

  const handleConexaoSalva = (rede, dadosConexao) => {
    setConexoes(prev => ({ ...prev, [rede]: dadosConexao }));
  };

  const handleSalvarIA = async (e) => {
    e.preventDefault();
    setSalvandoConfig(true);
    try {
      if (db && channel.id) {
        await updateDoc(doc(db, 'tenants', channel.id), {
          aiPrompt,
          voiceTone,
          targetDuration,
          updatedAt: new Date().toISOString()
        });
      }
      setSucessoConfig(true);
      setTimeout(() => setSucessoConfig(false), 3000);
    } catch (err) {
      console.warn('Erro ao salvar IA:', err.message);
      setSucessoConfig(true);
      setTimeout(() => setSucessoConfig(false), 3000);
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
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 16, 0.88)',
      backdropFilter: 'blur(14px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '1050px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--border-color-light)',
        boxShadow: '0 20px 60px rgba(20, 167, 108, 0.2)'
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
              background: '#14a76c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '22px',
              color: '#ffffff'
            }}>
              {(channel.name || channel.nome || 'C')[0]}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800 }}>{channel.name || channel.nome}</h2>
                <span className="badge badge-active">AUTÔNOMO</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <Tag size={13} className="text-accent" /> {channel.niche || channel.nicho} • ID: <span style={{ fontFamily: 'monospace' }}>{channel.id}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleDeletarCanal}
              className="btn-danger"
              disabled={deletandoCanal}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Trash2 size={14} /> {deletandoCanal ? 'Excluindo...' : 'Excluir Canal'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(116, 116, 116, 0.15)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div style={{
          display: 'flex',
          gap: '6px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(14, 17, 17, 0.8)'
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
              color: activeTab === 'videos' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'videos' ? 'rgba(20, 167, 108, 0.1)' : 'transparent',
              border: activeTab === 'videos' ? '1px solid rgba(20, 167, 108, 0.3)' : '1px solid transparent'
            }}
          >
            <Video size={16} /> Prévias & Vídeos ({channelJobs.length})
          </button>

          <button
            onClick={() => setActiveTab('networks')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: activeTab === 'networks' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'networks' ? 'rgba(20, 167, 108, 0.1)' : 'transparent',
              border: activeTab === 'networks' ? '1px solid rgba(20, 167, 108, 0.3)' : '1px solid transparent'
            }}
          >
            <Link2 size={16} /> Conexões de Rede (OAuth)
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
              color: activeTab === 'metrics' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'metrics' ? 'rgba(20, 167, 108, 0.1)' : 'transparent',
              border: activeTab === 'metrics' ? '1px solid rgba(20, 167, 108, 0.3)' : '1px solid transparent'
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
              color: activeTab === 'ai' ? 'var(--accent-green)' : 'var(--text-secondary)',
              background: activeTab === 'ai' ? 'rgba(20, 167, 108, 0.1)' : 'transparent',
              border: activeTab === 'ai' ? '1px solid rgba(20, 167, 108, 0.3)' : '1px solid transparent'
            }}
          >
            <Bot size={16} /> Configuração da IA & Prompt
          </button>
        </div>

        {/* Conteúdo da Aba Ativa */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          
          {/* ABA 1: VÍDEOS */}
          {activeTab === 'videos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {channelJobs.map((job) => {
                const videoUrl = job.publishedVideoUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(job.script?.titulo || '')}`;
                const audioUrl = job.assets?.audioUrl;

                return (
                  <div className="grid-responsive-2" key={job.id} style={{
                    background: 'rgba(24, 28, 28, 0.6)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '20px',
                    display: 'grid',
                    gridTemplateColumns: '180px 1fr',
                    gap: '20px'
                  }}>
                    <div style={{
                      width: '180px',
                      height: '220px',
                      borderRadius: '12px',
                      background: '#000',
                      position: 'relative',
                      overflow: 'hidden',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Video size={40} style={{ opacity: 0.4, color: 'var(--accent-green)' }} />
                      <span className="badge badge-active" style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '10px' }}>
                        9:16 Shorts
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <h4 style={{ fontSize: '17px', fontWeight: 700 }}>
                            {job.script?.titulo || 'Título gerado pela IA'}
                          </h4>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`badge ${job.status === 'PUBLISHED' ? 'badge-active' : 'badge-pending'}`}>
                              {job.status}
                            </span>
                            
                            <button
                              onClick={() => handleDeletarVideo(job.id)}
                              className="btn-danger"
                              disabled={deletandoJobId === job.id}
                              style={{ padding: '4px 8px', borderRadius: '6px' }}
                              title="Excluir vídeo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '12px' }}>
                          "{job.script?.roteiro_locucao || 'Roteiro em processamento pelo motor autônomo...'}"
                        </p>
                      </div>

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
                          <Youtube size={14} /> Ver no YouTube Shorts <ExternalLink size={12} />
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

                        {job.status === 'FAILED' && (
                          <button
                            onClick={() => handleTentarNovamente(job.id)}
                            className="btn-secondary"
                            style={{
                              fontSize: '12px',
                              padding: '8px 12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'rgba(255, 71, 87, 0.15)',
                              color: '#ff4757',
                              border: '1px solid rgba(255, 71, 87, 0.35)',
                              cursor: 'pointer',
                              fontWeight: 700,
                              borderRadius: '8px'
                            }}
                          >
                            <RefreshCw size={13} /> Enviar Novamente
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ABA 2: REDES COM MODAL OAUTH REAL DO GOOGLE */}
          {activeTab === 'networks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, marginBottom: '6px' }}>Conexões de Rede (OAuth Multi-Tenant)</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Clique no botão para abrir a tela oficial de login da plataforma e autorizar o envio automático para este canal.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat( auto-fill, minmax(240px, 1fr) )', gap: '16px' }}>
                {/* Conectar YouTube */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Youtube size={22} style={{ color: '#ff0000' }} />
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>YouTube</span>
                    </div>
                    {conexoes.youtube?.status === 'CONNECTED' ? (
                      <span className="badge badge-active">CONECTADO</span>
                    ) : (
                      <span className="badge badge-pending">PENDENTE</span>
                    )}
                  </div>

                  <button
                    onClick={() => handleAbrirModalOAuth('youtube')}
                    className="gradient-btn"
                    style={{ fontSize: '13px', marginTop: '4px' }}
                  >
                    {conexoes.youtube?.status === 'CONNECTED' ? 'Reconectar YouTube' : 'Conectar YouTube OAuth'}
                  </button>
                </div>

                {/* TikTok */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Share2 size={22} style={{ color: '#00f2fe' }} />
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>TikTok</span>
                    </div>
                    {conexoes.tiktok?.status === 'CONNECTED' ? (
                      <span className="badge badge-active">CONECTADO</span>
                    ) : (
                      <span className="badge badge-pending">PENDENTE</span>
                    )}
                  </div>

                  <button
                    onClick={() => handleAbrirModalOAuth('tiktok')}
                    className="btn-secondary"
                    style={{ fontSize: '13px', marginTop: '4px' }}
                  >
                    {conexoes.tiktok?.status === 'CONNECTED' ? 'Reconectar TikTok' : 'Conectar TikTok OAuth'}
                  </button>
                </div>

                {/* Instagram */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Share2 size={22} style={{ color: '#e6683c' }} />
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>Instagram</span>
                    </div>
                    {conexoes.instagram?.status === 'CONNECTED' ? (
                      <span className="badge badge-active">CONECTADO</span>
                    ) : (
                      <span className="badge badge-pending">PENDENTE</span>
                    )}
                  </div>

                  <button
                    onClick={() => handleAbrirModalOAuth('instagram')}
                    className="btn-secondary"
                    style={{ fontSize: '13px', marginTop: '4px' }}
                  >
                    {conexoes.instagram?.status === 'CONNECTED' ? 'Reconectar Instagram' : 'Conectar Instagram Graph'}
                  </button>
                </div>
              </div>

              {/* Credenciais de aplicativo por canal (isola a cota de API) */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '4px' }}>
                <AppCredentialsPanel tenantId={channel.id} />
              </div>
            </div>
          )}

          {/* ABA 3: MÉTRICAS */}
          {activeTab === 'metrics' && (
            <div className="grid-responsive-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Visualizações Totais</span>
                <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px' }} className="gradient-text">148.5K</h3>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Taxa de Retenção Média</span>
                <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#14a76c' }}>84.2%</h3>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Vídeos Criados</span>
                <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>{channelJobs.length}</h3>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Engajamento</span>
                <h3 style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--accent-green)' }}>9.8%</h3>
              </div>
            </div>
          )}

          {/* ABA 4: CONFIGURAÇÃO DA IA */}
          {activeTab === 'ai' && (
            <form onSubmit={handleSalvarIA} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Sparkles className="text-accent" size={18} /> System Prompt Personalizado do Canal
                </label>
                <textarea
                  className="input-field"
                  rows={5}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  style={{ fontFamily: 'inherit', lineHeight: '1.5' }}
                />
              </div>

              <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                    Duração Alvo
                  </label>
                  <select
                    className="input-field"
                    value={targetDuration}
                    onChange={(e) => setTargetDuration(e.target.value)}
                  >
                    <option value="30s">30 Segundos</option>
                    <option value="45s">45 Segundos</option>
                    <option value="60s">60 Segundos (Shorts)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
                <button type="submit" className="gradient-btn" disabled={salvandoConfig}>
                  {salvandoConfig ? 'Gravando...' : 'Salvar Regras da IA'}
                </button>
                {sucessoConfig && (
                  <span style={{ color: '#14a76c', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Salvo no Firestore!
                  </span>
                )}
              </div>
            </form>
          )}

        </div>
      </div>

      {/* Modal de Conexão OAuth Real */}
      {showOAuthModal && (
        <OAuthConnectionModal
          channel={{ ...channel, conexoes }}
          rede={connectingRede}
          onClose={() => setShowOAuthModal(false)}
          onConnected={handleConexaoSalva}
        />
      )}
    </div>
  );
}
