import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import CriarVideoModal from './CriarVideoModal';
import { getProgressStage, isFailed } from '../lib/jobStatus';
import {
  Video, Play, Pause, Youtube, Eye, Trash2, Layers, Cpu, CheckCircle2,
  Clock, Sparkles, Loader2, Share2, ExternalLink, Plus, Zap, RefreshCw, AlertCircle,
  Film, Activity, CheckCircle
} from 'lucide-react';

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
  const [showCriarModal, setShowCriarModal] = useState(false);
  const [erroFirestore, setErroFirestore] = useState(null);

  // Escuta Canais
  useEffect(() => {
    const unsubCanais = onSnapshot(collection(db, 'tenants'), (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCanais(lista);
    }, (err) => console.warn('Erro ao carregar canais:', err.message));

    return () => unsubCanais();
  }, []);

  // Escuta Fila de Produção
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

  const handleDeletarVideo = async (e, jobId) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este vídeo da esteira?')) return;

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
          padding: '14px 18px', border: '1px solid rgba(239, 68, 68, 0.3)',
          background: 'rgba(239, 68, 68, 0.05)', display: 'flex', gap: '12px', alignItems: 'center'
        }}>
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ fontSize: '13px', color: '#fca5a5' }}>
            Não foi possível sincronizar a esteira no Firestore: {erroFirestore}
          </div>
        </div>
      )}

      {/* Top Stats & Filters Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) 260px',
        gap: '16px',
        alignItems: 'center'
      }}>
        {/* KPI 1 */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color="#10b981" />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Em Produção</span>
            <h4 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{videosEmProducao.length}</h4>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={20} color="#06b6d4" />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vídeos Concluídos</span>
            <h4 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{videosPublicados.length}</h4>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} color="#f59e0b" />
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Esteira Autônoma</span>
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>IA 24H ONLINE</h4>
          </div>
        </div>

        {/* Seletor de Canal */}
        <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Layers size={16} className="text-accent" />
          <select
            className="input-field"
            style={{ border: 'none', background: 'transparent', padding: '4px', fontSize: '13px', fontWeight: 600 }}
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
          >
            <option value="ALL">Todos os Canais</option>
            {canais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid Principal com Esteira à Esquerda e Player à Direita */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '24px' }}>
        
        {/* COLUNA 1: ESTEIRA DE PRODUÇÃO (FILA ATIVA) */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} className="text-accent" />
              <h4 style={{ fontSize: '15px', fontWeight: 800 }}>Fila de Processamento em Tempo Real</h4>
            </div>
            <span className="badge badge-pending">{videosEmProducao.length} em esteira</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '680px', overflowY: 'auto' }}>
            {videosEmProducao.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <h5 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>Nenhum vídeo na fila no momento</h5>
                <p style={{ fontSize: '12px', marginTop: '4px' }}>Clique em "Novo Vídeo" para iniciar uma produção agora.</p>
              </div>
            ) : (
              videosEmProducao.map((job) => {
                const stage = getProgressStage(job.status, job);
                const falhou = isFailed(job.status);

                return (
                  <div
                    key={job.id}
                    style={{
                      background: 'var(--bg-input)',
                      border: `1px solid ${falhou ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-subtle)'}`,
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          JOB #{job.id.slice(-8)}
                        </span>
                        <h5 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {tituloDoJob(job) || 'Processando Roteiro com Gemini...'}
                        </h5>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {falhou && (
                          <button
                            onClick={(e) => handleEnviarNovamente(e, job.id)}
                            className="btn-secondary"
                            style={{ fontSize: '11px', padding: '5px 10px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          >
                            <RefreshCw size={11} /> Tentar Novamente
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeletarVideo(e, job.id)}
                          className="btn-ghost"
                          style={{ padding: '6px', color: 'var(--text-muted)' }}
                          title="Remover"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Barra de Progresso Suave */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                        <span style={{
                          color: falhou ? '#ef4444' : '#10b981',
                          fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                          {falhou ? <AlertCircle size={12} /> : <Loader2 size={12} style={{ animation: 'spin 1.5s linear infinite' }} />}
                          {falhou ? 'Erro no processamento' : stage.label}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontFamily: 'monospace' }}>
                          {stage.percent}%
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${stage.percent}%`,
                          height: '100%',
                          background: falhou ? '#ef4444' : 'var(--accent-gradient)',
                          borderRadius: '6px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>

                      {falhou && job.errorMessage && (
                        <span style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px', lineHeight: 1.4 }}>
                          {job.errorMessage}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUNA 2: VÍDEOS PUBLICADOS & PREVIEW PLAYER */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Film size={18} className="text-accent" />
              <h4 style={{ fontSize: '15px', fontWeight: 800 }}>Vídeos Finalizados ({videosPublicados.length})</h4>
            </div>
            <span className="badge badge-active">CONCLUÍDO</span>
          </div>

          {/* Player Ativo / Prévia */}
          {activeEmbedVideo ? (
            <div style={{ background: '#000', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              {getYoutubeEmbedId(activeEmbedVideo) ? (
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${getYoutubeEmbedId(activeEmbedVideo)}?autoplay=0&rel=0`}
                    title="Player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Video size={36} style={{ margin: '0 auto 10px', opacity: 0.4, color: '#10b981' }} />
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{tituloDoJob(activeEmbedVideo)}</p>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Vídeo renderizado em alta definição 9:16</span>
                </div>
              )}

              <div style={{ padding: '14px', background: 'var(--bg-input)', borderTop: '1px solid var(--border-subtle)' }}>
                <h5 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {tituloDoJob(activeEmbedVideo) || 'Vídeo Concluído'}
                </h5>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                  "{activeEmbedVideo.script?.roteiro_locucao || 'Roteiro finalizado pela IA'}"
                </p>
              </div>
            </div>
          ) : (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Video size={36} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <p style={{ fontSize: '13px' }}>Selecione um vídeo finalizado abaixo para assistir</p>
            </div>
          )}

          {/* Lista de Vídeos Concluídos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
            {videosPublicados.map((job) => (
              <div
                key={job.id}
                onClick={() => setActiveEmbedVideo(job)}
                style={{
                  background: activeEmbedVideo?.id === job.id ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-input)',
                  border: `1px solid ${activeEmbedVideo?.id === job.id ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-subtle)'}`,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ maxWidth: '75%' }}>
                  <h5 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tituloDoJob(job) || 'Vídeo sem título'}
                  </h5>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {job.createdAt ? new Date(job.createdAt).toLocaleTimeString() : 'Publicado'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button className="btn-secondary" style={{ padding: '5px 8px', fontSize: '11px' }}>
                    <Play size={11} /> Ver
                  </button>
                  <button
                    onClick={(e) => handleDeletarVideo(e, job.id)}
                    className="btn-ghost"
                    style={{ padding: '5px', color: 'var(--text-muted)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {showCriarModal && (
        <CriarVideoModal
          onClose={() => setShowCriarModal(false)}
          initialTenantId={selectedTenant !== 'ALL' ? selectedTenant : ''}
        />
      )}
    </div>
  );
}
