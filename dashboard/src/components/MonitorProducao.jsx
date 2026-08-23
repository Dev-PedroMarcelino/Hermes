import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import CriarVideoQuickModal from './CriarVideoQuickModal';
import PreviewImagensModal from './PreviewImagensModal';
import { getProgressStage, isFailed } from '../lib/jobStatus';
import {
  Video, Play, Pause, Youtube, Eye, Trash2, Layers, Cpu, CheckCircle2,
  Clock, Sparkles, Loader2, Share2, ExternalLink, Plus, Zap, RefreshCw, AlertCircle,
  Image as ImageIcon
} from 'lucide-react';

/**
 * The engine's Gemini stage emits `title`; older documents used `titulo`.
 * Read both so the monitor works across the two generations of job records.
 */
function tituloDoJob(job) {
  return job?.script?.title || job?.script?.titulo || null;
}

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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [erroFirestore, setErroFirestore] = useState(null);

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

      const publicado = lista.find(j => j.status === 'PUBLISHED' && (j.publishedVideoUrl || tituloDoJob(j)));
      if (publicado && !activeEmbedVideo) {
        setActiveEmbedVideo(publicado);
      }

      setErroFirestore(null);
      setLoading(false);
    }, (error) => {
      // A Firestore failure used to substitute a fake "published" job here,
      // which made a broken connection look like a working pipeline. Surface
      // the real error instead.
      console.error('Erro no listener do Firestore:', error.message);
      setErroFirestore(error.message);
      setJobs([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const jobsFiltrados = selectedTenant === 'ALL' 
    ? jobs 
    : jobs.filter(j => j.tenantId === selectedTenant || j.id.includes(selectedTenant));

  const videosPublicados = jobsFiltrados.filter(j => j.status === 'PUBLISHED');
  const videosEmProducao = jobsFiltrados.filter(j => j.status !== 'PUBLISHED');

  // Progress mapping lives in ../lib/jobStatus.js so it stays in sync with the
  // engine's JOB_STATUS ladder.
  //
  // The old "Avançar Fase" button that used to sit here wrote statuses straight
  // into Firestore — including a hardcoded YouTube ID — which faked progress
  // without producing anything. Phases are now driven solely by the worker.

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

  const handleEnviarNovamente = async (e, jobId) => {
    if (e) e.stopPropagation();
    try {
      if (db) {
        await updateDoc(doc(db, 'video_jobs', jobId), {
          status: 'QUEUED',
          errorMessage: null,
          renderProgress: null,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Erro ao reenviar vídeo:', err.message);
      alert('Não foi possível reenviar o vídeo: ' + err.message);
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

      {erroFirestore && (
        <div className="glass-panel" style={{
          padding: '16px 20px', border: '1px solid rgba(255, 71, 87, 0.35)',
          display: 'flex', gap: '12px', alignItems: 'flex-start'
        }}>
          <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
            <strong>Não foi possível ler a esteira no Firestore.</strong>
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
              {erroFirestore}
            </div>
          </div>
        </div>
      )}

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

          <button
            onClick={() => setShowPreviewModal(true)}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              border: '1px solid rgba(0, 255, 135, 0.4)',
              color: '#00ff87',
              background: 'rgba(0, 255, 135, 0.08)'
            }}
          >
            <ImageIcon size={18} /> Prévia de Imagens
          </button>

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
                  <p style={{ fontSize: '14px', fontWeight: 600 }}>{tituloDoJob(activeEmbedVideo)}</p>
                </div>
              )}

              <div style={{ padding: '16px', background: 'rgba(11, 16, 21, 0.95)', borderTop: '1px solid var(--border-color)' }}>
                <h5 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                  {tituloDoJob(activeEmbedVideo) || 'Vídeo Publicado'}
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
                      {tituloDoJob(job) || 'Vídeo sem título'}
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

        {/* COLUNA 2: VÍDEOS EM PRODUÇÃO COM BARRA E BOTÃO DE AVANÇO */}
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
                const stage = getProgressStage(job.status, job);
                const falhou = isFailed(job.status);

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
                          {tituloDoJob(job) || 'Processando Roteiro Gemini...'}
                        </h5>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={(e) => handleEnviarNovamente(e, job.id)}
                          className="btn-secondary"
                          title="Reiniciar este vídeo do zero na esteira de produção"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: 'rgba(0, 255, 135, 0.10)',
                            color: '#00ff87',
                            border: '1px solid rgba(0, 255, 135, 0.3)',
                            cursor: 'pointer'
                          }}
                        >
                          <RefreshCw size={12} /> Enviar Novamente
                        </button>
                        <button
                          onClick={(e) => handleDeletarVideo(e, job.id)}
                          className="btn-danger"
                          style={{ padding: '6px 8px', borderRadius: '8px' }}
                          title="Excluir vídeo"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* BARRA DE PROGRESSO EM TEMPO REAL */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                        <span style={{
                          color: falhou ? '#ff4757' : '#00ff87',
                          fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                          {falhou
                            ? <AlertCircle size={13} />
                            : <Loader2 size={13} style={{ animation: 'spin 2s linear infinite' }} />}
                          {falhou ? 'Falhou' : stage.label}
                        </span>
                        <span style={{
                          color: falhou ? '#ff4757' : '#00ff87',
                          fontWeight: 800, fontFamily: 'monospace'
                        }}>
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
                          background: falhou
                            ? 'linear-gradient(90deg, #ff4757, #ff6b81)'
                            : 'linear-gradient(90deg, #00ff87, #60efff)',
                          borderRadius: '10px',
                          boxShadow: falhou
                            ? '0 0 12px rgba(255, 71, 87, 0.6)'
                            : '0 0 12px rgba(0, 255, 135, 0.6)',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {falhou && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                          {job.errorMessage && (
                            <span style={{ fontSize: '11px', color: '#ff9aa5', lineHeight: 1.5 }}>
                              {job.errorMessage}
                            </span>
                          )}
                          <button
                            onClick={(e) => handleEnviarNovamente(e, job.id)}
                            className="btn-secondary"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              padding: '8px 14px',
                              borderRadius: '8px',
                              width: 'fit-content',
                              background: 'rgba(255, 71, 87, 0.15)',
                              color: '#ff4757',
                              border: '1px solid rgba(255, 71, 87, 0.35)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <RefreshCw size={13} /> Enviar Novamente
                          </button>
                        </div>
                      )}
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

      {/* Modal de Prévia e Validação de Imagens da IA */}
      {showPreviewModal && (
        <PreviewImagensModal
          onClose={() => setShowPreviewModal(false)}
          initialTenantId={selectedTenant !== 'ALL' ? selectedTenant : ''}
        />
      )}
    </div>
  );
}
