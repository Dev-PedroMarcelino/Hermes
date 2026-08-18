import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import CriarVideoQuickModal from './CriarVideoQuickModal';
import { 
  Video, Play, Pause, Youtube, Eye, Trash2, Layers, Cpu, CheckCircle2, 
  Clock, Sparkles, Loader2, Share2, ExternalLink, Plus
} from 'lucide-react';

export default function MonitorProducao() {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('ALL');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeEmbedVideo, setActiveEmbedVideo] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioRef, setAudioRef] = useState(null);
  const [deletandoJobId, setDeletandoJobId] = useState(null);
  const [showQuickModal, setShowQuickModal] = useState(false);

  // Escuta os Canais
  useEffect(() => {
    const unsubCanais = onSnapshot(collection(db, 'tenants'), (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCanais(lista);
    }, (err) => console.warn('Erro ao carregar canais:', err.message));

    return () => unsubCanais();
  }, []);

  // Escuta a Esteira de Produção de Vídeos no Firestore
  useEffect(() => {
    const jobsQuery = query(collection(db, 'video_jobs'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const lista = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(job => job.status !== 'DELETED');

      setJobs(lista);

      const publicado = lista.find(j => j.status === 'PUBLISHED' && (j.publishedVideoUrl || j.script?.titulo));
      if (publicado && !activeEmbedVideo) {
        setActiveEmbedVideo(publicado);
      }

      setLoading(false);
    }, (error) => {
      console.warn('Firestore onSnapshot fallback:', error.message);
      const mockJob = {
        id: 'job_1787014138780',
        tenantId: 'tenant_test_1787011929715',
        status: 'PUBLISHED',
        script: {
          titulo: 'O supercomputador que prevê o futuro climático #Shorts',
          roteiro_locucao: 'Você sabia que existem sistemas de inteligência artificial desenvolvidos para operar sem supervisão humana? O futuro já começou.',
          tags: ['#ia', '#futuro']
        },
        distributionLog: { youtube: { videoId: 'dQw4w9WgXcQ' } },
        publishedVideoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        createdAt: new Date().toISOString()
      };
      setJobs([mockJob]);
      setActiveEmbedVideo(mockJob);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const jobsFiltrados = selectedTenant === 'ALL' 
    ? jobs 
    : jobs.filter(j => j.tenantId === selectedTenant || j.id.includes(selectedTenant));

  const videosPublicados = jobsFiltrados.filter(j => j.status === 'PUBLISHED');
  const videosEmProducao = jobsFiltrados.filter(j => j.status !== 'PUBLISHED');

  const getProgressStage = (status) => {
    switch (status) {
      case 'AUDIO_GEN':
        return { percent: 25, label: '1/4 - Roteiro Gemini Concluído (Gerando Voz Neural EdgeTTS)', step: 1 };
      case 'VIDEO_RENDER':
        return { percent: 50, label: '2/4 - Renderizando Vídeo Vertical e Legendas (FFmpeg)', step: 2 };
      case 'READY_TO_UPLOAD':
      case 'UPLOADING':
        return { percent: 75, label: '3/4 - Vídeo Físico Renderizado (Realizando Upload YouTube API)', step: 3 };
      case 'PUBLISHED':
        return { percent: 100, label: '4/4 - Publicado no YouTube Shorts!', step: 4 };
      default:
        return { percent: 15, label: 'Iniciando Processamento da IA...', step: 1 };
    }
  };

  const handleDeletarVideo = async (e, jobId) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este vídeo da esteira de produção?')) return;

    setDeletandoJobId(jobId);
    setJobs(prev => prev.filter(j => j.id !== jobId));

    try {
      if (db) {
        await deleteDoc(doc(db, 'video_jobs', jobId));
      }
    } catch (err) {
      console.warn('Erro ao deletar Firestore:', err.message);
      try {
        if (db) {
          await updateDoc(doc(db, 'video_jobs', jobId), { status: 'DELETED', updatedAt: new Date().toISOString() });
        }
      } catch (e2) {
        console.warn('Fallback updateDoc erro:', e2.message);
      }
    } finally {
      setDeletandoJobId(null);
    }
  };

  const getYoutubeEmbedId = (job) => {
    if (job?.distributionLog?.youtube?.videoId) {
      return job.distributionLog.youtube.videoId;
    }
    if (job?.publishedVideoUrl) {
      const match = job.publishedVideoUrl.match(/(?:v=|\/shorts\/|\/embed\/|\/watch\?v=)([^&?#/]+)/);
      if (match && match[1]) return match[1];
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Barra Superior com Filtro e Botão + Novo Vídeo Instantâneo */}
      <div className="glass-panel tech-card" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Layers className="text-accent" size={24} />
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Monitor de Produção Ao Vivo</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Acompanhe em tempo real a evolução da esteira da IA</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Canal:
            </label>
            <select
              className="input-field"
              style={{ width: '220px' }}
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
            >
              <option value="ALL">🌐 Todos os Canais</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Botão + Novo Vídeo Instantâneo */}
          <button
            onClick={() => setShowQuickModal(true)}
            className="gradient-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontSize: '13px' }}
          >
            <Plus size={18} /> Criar Novo Vídeo
          </button>
        </div>
      </div>

      {/* Grid Principal em 2 Colunas */}
      <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        
        {/* COLUNA 1: VÍDEOS PUBLICADOS & PLAYER DO YOUTUBE */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Youtube size={20} style={{ color: '#ff0000' }} /> Vídeos Publicados ({videosPublicados.length})
            </h4>
            <span className="badge badge-active">NO AR</span>
          </div>

          {/* Player do YouTube Incorporado */}
          {activeEmbedVideo && (
            <div style={{ background: '#000', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
              {getYoutubeEmbedId(activeEmbedVideo) ? (
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${getYoutubeEmbedId(activeEmbedVideo)}?autoplay=0&rel=0`}
                    title="Player do YouTube"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Video size={40} style={{ margin: '0 auto 12px', opacity: 0.4, color: '#00ff87' }} />
                  <p style={{ fontSize: '14px', fontWeight: 600 }}>{activeEmbedVideo.script?.titulo}</p>
                </div>
              )}

              <div style={{ padding: '16px', background: 'rgba(11, 16, 21, 0.95)', borderTop: '1px solid var(--border-color)' }}>
                <h5 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                  {activeEmbedVideo.script?.titulo || 'Vídeo Publicado'}
                </h5>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  "{activeEmbedVideo.script?.roteiro_locucao || 'Roteiro gerado pela IA'}"
                </p>
              </div>
            </div>
          )}

          {/* Lista de Vídeos Publicados */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto' }}>
            {videosPublicados.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Nenhum vídeo publicado ainda para o canal selecionado.
              </div>
            ) : (
              videosPublicados.map((job) => (
                <div
                  key={job.id}
                  onClick={() => setActiveEmbedVideo(job)}
                  style={{
                    background: activeEmbedVideo?.id === job.id ? 'rgba(0, 255, 135, 0.08)' : 'rgba(255,255,255,0.02)',
                    border: activeEmbedVideo?.id === job.id ? '1px solid #00ff87' : '1px solid var(--border-color)',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ maxWidth: '75%' }}>
                    <h5 style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {job.script?.titulo || 'Vídeo sem título'}
                    </h5>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                      {job.createdAt ? new Date(job.createdAt).toLocaleTimeString() : 'Publicado'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Play size={12} /> Assistir
                    </button>
                    <button
                      onClick={(e) => handleDeletarVideo(e, job.id)}
                      className="btn-danger"
                      style={{ padding: '6px 8px', borderRadius: '6px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUNA 2: VÍDEOS EM PRODUÇÃO / NA FILA COM BARRA DE PROGRESSO */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu className="text-accent" size={20} /> Esteira de Produção & Fila ({videosEmProducao.length})
            </h4>
            <span className="badge badge-pending">EM ANDAMENTO</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '680px', overflowY: 'auto' }}>
            {videosEmProducao.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Clock size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                Nenhum vídeo em fila no momento. Clique no botão <strong>+ Criar Novo Vídeo</strong> acima!
              </div>
            ) : (
              videosEmProducao.map((job) => {
                const stage = getProgressStage(job.status);

                return (
                  <div
                    key={job.id}
                    style={{
                      background: 'rgba(6, 9, 12, 0.95)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '14px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          ID: {job.id}
                        </span>
                        <h5 style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                          {job.script?.titulo || 'Processando Roteiro Gemini...'}
                        </h5>
                      </div>

                      <button
                        onClick={(e) => handleDeletarVideo(e, job.id)}
                        className="btn-danger"
                        style={{ padding: '4px 8px', borderRadius: '6px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* BARRA DE PROGRESSO EM TEMPO REAL */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span style={{ color: '#00ff87', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Loader2 size={13} style={{ animation: 'spin 2s linear infinite' }} /> {stage.label}
                        </span>
                        <span style={{ color: '#00ff87', fontWeight: 800, fontFamily: 'monospace' }}>
                          {stage.percent}%
                        </span>
                      </div>

                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${stage.percent}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #00ff87, #60efff)',
                          borderRadius: '10px',
                          boxShadow: '0 0 12px rgba(0, 255, 135, 0.6)',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Modal de Criação Rápida de Vídeo + */}
      {showQuickModal && (
        <CriarVideoQuickModal
          onClose={() => setShowQuickModal(false)}
        />
      )}
    </div>
  );
}
