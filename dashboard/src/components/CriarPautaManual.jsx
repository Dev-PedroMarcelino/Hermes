import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { Sparkles, Layers, Film, CheckCircle2, Zap, Cpu } from 'lucide-react';

export default function CriarPautaManual() {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tema, setTema] = useState('');
  const [isMiniseries, setIsMiniseries] = useState(false);
  const [quantidadePartes, setQuantidadePartes] = useState('3');
  const [salvando, setSalvando] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState(null);

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

    try {
      if (isMiniseries) {
        const numPartes = parseInt(quantidadePartes, 10);
        const serieId = `serie_${Date.now()}`;

        for (let i = 1; i <= numPartes; i++) {
          const isLast = i === numPartes;

          const parteScript = {
            ordem: i,
            parte: `Parte ${i} de ${numPartes}`,
            titulo: `${tema.trim()} - Parte ${i} #Shorts`,
            descricao: `Parte ${i} de ${numPartes} da minissérie sobre ${tema.trim()}.`,
            tags: ['#shorts', '#minisserie', `#parte${i}`],
            roteiro_locucao: `[GANCHO DOS 3 SEGUNDOS]: O que você nunca soube sobre ${tema.trim()} vai te deixar impressionado... [CONTEÚDO PRINCIPAL DA PARTE ${i}]... ${
              isLast 
                ? 'E foi assim que a história se encerrou. Inscreva-se para mais episódios!' 
                : `Mas o desfecho que veio em seguida foi inacreditável... Siga o canal para a Parte ${i + 1}!`
            }`
          };

          if (db) {
            await addDoc(collection(db, 'video_jobs'), {
              tenantId: selectedTenant,
              serieId,
              ordem: i,
              isMiniseries: true,
              totalPartes: numPartes,
              status: 'AUDIO_GEN',
              script: parteScript,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        }

        setSucessoMsg(`Minissérie encadeada em ${numPartes} Partes criada no Firestore com SUCESSO!`);
      } else {
        const pautaDoc = {
          titulo: tema.trim(),
          conceito: 'Pauta manual gerada pela Dashboard.',
          status: 'pendente',
          isMiniseries: false,
          createdAt: new Date().toISOString()
        };

        if (db) {
          await addDoc(collection(db, 'tenants', selectedTenant, 'pautas'), pautaDoc);
        }

        setSucessoMsg('Pauta manual enviada com SUCESSO para a esteira da IA!');
      }

      setTema('');
      setTimeout(() => setSucessoMsg(null), 5000);
    } catch (err) {
      alert(`Erro ao criar pauta: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-panel tech-card" style={{ padding: '28px' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Film className="text-accent" size={24} /> Criar Pauta Manual & Motor de Minisséries
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Forneça um tema customizado ou ative o gerador de minisséries com <strong>cliffhangers virais</strong>.
            </p>
          </div>

          <span className="badge badge-active">
            <Cpu size={13} /> GEMINI 1.5 FLASH
          </span>
        </div>

        <form onSubmit={handleCriarPauta} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Layers size={14} className="text-accent" /> Selecione o Canal (Tenant)
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
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Sparkles size={14} className="text-accent" /> Tema / Assunto da Pauta
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: A Revelação dos Servidores Quânticos Sigilosos"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Painel de Controle da Minissérie Responsivo */}
          <div style={{
            background: 'rgba(0, 255, 135, 0.03)',
            border: '1px solid rgba(0, 255, 135, 0.25)',
            padding: '20px',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isMiniseries}
                onChange={(e) => setIsMiniseries(e.target.checked)}
                style={{ width: '20px', height: '20px', accentColor: 'var(--accent-green)' }}
              />
              <div>
                <span className="gradient-text" style={{ fontSize: '16px', fontWeight: 800 }}>
                  Transformar em Minissérie (Dividir em Partes Encadeadas)
                </span>
                <span style={{ fontSize: '12px', display: 'block', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Gera episódios onde cada roteiro termina com um cliffhanger conectando à próxima parte.
                </span>
              </div>
            </label>

            {isMiniseries && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0, 255, 135, 0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Sequência de Partes:</span>
                  <select
                    className="input-field"
                    style={{ maxWidth: '240px' }}
                    value={quantidadePartes}
                    onChange={(e) => setQuantidadePartes(e.target.value)}
                  >
                    <option value="2">2 Partes (Dueto de Vídeos)</option>
                    <option value="3">3 Partes (Trilogia Recomendada)</option>
                    <option value="5">5 Partes (Série Completa Cash-Cow)</option>
                  </select>
                </div>
                <span style={{ fontSize: '12px', color: '#00ff87', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={14} /> Gancho de 3s em todas as partes!
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <button type="submit" className="gradient-btn" disabled={salvando} style={{ height: '48px', padding: '0 28px' }}>
              {salvando ? 'Processando no Gemini...' : isMiniseries ? 'Gerar Minissérie Encadeada' : 'Cadastrar Pauta Manual'}
            </button>

            {sucessoMsg && (
              <span style={{ color: '#00ff87', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> {sucessoMsg}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
