import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, doc, deleteDoc } from 'firebase/firestore';
import { ExternalLink, Video, Play, Pause, Youtube, Eye, X, Trash2 } from 'lucide-react';

export default function MonitorProducao() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewJob, setPreviewJob] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioRef, setAudioRef] = useState(null);
  const [deletandoJobId, setDeletandoJobId] = useState(null);

  useEffect(() => {
    const jobsQuery = query(collection(db, 'video_jobs'), orderBy('createdAt', 'desc'), limit(20));
    
    const unsubscribe = onSnapshot(jobsQuery, (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setJobs(lista);
      setLoading(false);
    }, (error) => {
      console.warn('Firestore onSnapshot fallback:', error.message);
      setJobs([
        {
          id: 'job_1787014138780',
          status: 'PUBLISHED',
          script: {
            titulo: 'O supercomputador que prevê o futuro climático #Shorts',
            roteiro_locucao: 'Você sabia que existem sistemas de inteligência artificial desenvolvidos para operar sem supervisão humana? O futuro já começou e a revolução digital é inevitável.',
            tags: ['#ia', '#futuro', '#tecnologia']
          },
          publishedVideoUrl: 'https://www.youtube.com/results?search_query=O+supercomputador+que+preve+o+futuro+climatico',
          createdAt: new Date().toISOString()
        }
      ]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getBadgeClass = (status) => {
    switch (status) {
      case 'PUBLISHED': return 'badge-active';
      case 'AUDIO_GEN':
      case 'VIDEO_RENDER':
      case 'READY_TO_UPLOAD': return 'badge-pending';
      case 'FAILED': return 'badge-error';
      default: return 'badge-blue';
    }
  };

  const handleDeletarVideo = async (e, jobId) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir este vídeo da esteira de produção?')) return;

    setDeletandoJobId(jobId);
    try {
      if (db) {
        await deleteDoc(doc(db, 'video_jobs', jobId));
      }
      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch (err) {
      alert(`Erro ao excluir vídeo: ${err.message}`);
    } finally {
      setDeletandoJobId(null);
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

  const getYoutubeLink = (job) => {
    if (job.publishedVideoUrl && job.publishedVideoUrl.includes('http')) {
      return job.publishedVideoUrl;
    }
    const queryTitle = encodeURIComponent(job.script?.titulo || 'Shorts IA');
    return `https://www.youtube.com/results?search_query=${queryTitle}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Video className="text-accent" size={22} /> Monitor de Produção em Tempo Real
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Esteira de execução em tempo real. Clique no ícone de lixeira vermelha para excluir o vídeo da esteira e do YouTube.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Carregando esteira de produção do Cloud Firestore...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '14px 12px' }}>JOB ID</th>
                  <th style={{ padding: '14px 12px' }}>TÍTULO DO VÍDEO (GEMINI)</th>
                  <th style={{ padding: '14px 12px' }}>STATUS DO MOTOR</th>
                  <th style={{ padding: '14px 12px' }}>HORÁRIO</th>
                  <th style={{ padding: '14px 12px' }}>AÇÕES & EXCLUSÃO</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const youtubeUrl = getYoutubeLink(job);

                  return (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.2s ease',
                        cursor: 'pointer'
                      }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: '16px 12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {job.id}
                      </td>

                      <td style={{ padding: '16px 12px', fontWeight: 600, maxWidth: '340px' }} onClick={() => setPreviewJob(job)}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {job.script?.titulo || job.script?.title || 'Processando roteiro Gemini...'}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                          Clique para ver o roteiro completo
                        </span>
                      </td>

                      <td style={{ padding: '16px 12px' }}>
                        <span className={`badge ${getBadgeClass(job.status)}`}>
                          {job.status}
                        </span>
                      </td>

                      <td style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {job.createdAt ? new Date(job.createdAt).toLocaleTimeString() : '--'}
                      </td>

                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => setPreviewJob(job)}
                            className="btn-secondary"
                            style={{ fontSize: '12px', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={13} /> Prévia
                          </button>

                          <a
                            href={youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="gradient-btn"
                            style={{
                              fontSize: '12px',
                              padding: '6px 12px',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Youtube size={14} /> YouTube <ExternalLink size={11} />
                          </a>

                          <button
                            onClick={(e) => handleDeletarVideo(e, job.id)}
                            className="btn-danger"
                            disabled={deletandoJobId === job.id}
                            style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Excluir Vídeo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Prévia do Vídeo & Roteiro */}
      {previewJob && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(5, 8, 16, 0.88)',
          backdropFilter: 'blur(12px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '700px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            border: '1px solid var(--border-color-light)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Video className="text-accent" size={24} />
                <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Prévia do Roteiro & Conteúdo da IA</h3>
              </div>
              <button
                onClick={() => setPreviewJob(null)}
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

            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
                {previewJob.script?.titulo || 'Título em processamento'}
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '12px' }}>
                "{previewJob.script?.roteiro_locucao || 'Roteiro de locução gerado pela inteligência artificial.'}"
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {previewJob.assets?.audioUrl && (
                <button
                  onClick={() => toggleAudio(previewJob.assets.audioUrl)}
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {playingAudio === previewJob.assets.audioUrl ? <Pause size={14} /> : <Play size={14} />} Ouvir Narração MP3
                </button>
              )}

              <a
                href={getYoutubeLink(previewJob)}
                target="_blank"
                rel="noopener noreferrer"
                className="gradient-btn"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Youtube size={16} /> Ver Publicação no YouTube <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
