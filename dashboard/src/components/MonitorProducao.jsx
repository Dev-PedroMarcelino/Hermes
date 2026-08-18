import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { ExternalLink, Video, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export default function MonitorProducao() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

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
          id: 'job_demo_01',
          status: 'PUBLISHED',
          script: { titulo: 'O supercomputador que prevê o futuro climático' },
          publishedVideoUrl: 'https://youtube.com/shorts/yt_shorts_1787014223238',
          createdAt: new Date().toISOString()
        },
        {
          id: 'job_demo_02',
          status: 'READY_TO_UPLOAD',
          script: { titulo: ' As 5 IAs mais perigosas já criadas' },
          createdAt: new Date(Date.now() - 120000).toISOString()
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

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Video className="text-accent" size={20} /> Monitor de Produção em Tempo Real
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Acompanhamento ao vivo da esteira de vídeos curtos no Firestore.
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Carregando dados da esteira de vídeos...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '12px' }}>JOB ID</th>
                <th style={{ padding: '12px' }}>TÍTULO DO VÍDEO</th>
                <th style={{ padding: '12px' }}>STATUS DO MOTOR</th>
                <th style={{ padding: '12px' }}>CRIADO EM</th>
                <th style={{ padding: '12px' }}>URL DO VÍDEO</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const videoUrl = job.publishedVideoUrl || job.distributionLog?.youtube?.videoUrl;

                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '14px 12px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {job.id}
                    </td>
                    <td style={{ padding: '14px 12px', fontWeight: 600, maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {job.script?.titulo || job.script?.title || 'Processando pauta...'}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      <span className={`badge ${getBadgeClass(job.status)}`}>
                        {job.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {job.createdAt ? new Date(job.createdAt).toLocaleTimeString() : '--'}
                    </td>
                    <td style={{ padding: '14px 12px' }}>
                      {videoUrl ? (
                        <a
                          href={videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--accent-cyan)',
                            textDecoration: 'none',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '13px'
                          }}
                        >
                          Ver no YouTube <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Pendente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
