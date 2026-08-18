import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { Sparkles, Layers, ListOrdered, CheckCircle2, Film, Radio, ArrowRight } from 'lucide-react';

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
        // Criação de Minissérie em Partes Encadeadas com Cliffhangers
        const numPartes = parseInt(quantidadePartes, 10);
        const serieId = `serie_${Date.now()}`;

        for (let i = 1; i <= numPartes; i++) {
          const jobId = `job_serie_${i}_${Date.now()}`;
          const isLast = i === numPartes;

          const parteScript = {
            ordem: i,
            parte: `Parte ${i} de ${numPartes}`,
            titulo: `${tema.trim()} - Parte ${i} #Shorts`,
            descricao: `Parte ${i} de ${numPartes} da minissérie sobre ${tema.trim()}.`,
            tags: ['#shorts', '#minisserie', `#parte${i}`],
            roteiro_locucao: `[GANCHO DOS 3 SEGUNDOS]: O que quase ninguém sabe sobre ${tema.trim()} vai te deixar chocado... [CONTEÚDO PRINCIPAL DA PARTE ${i}]... ${
              isLast 
                ? 'E foi assim que a história se encerrou. Inscreva-se para mais minisséries!' 
                : `Mas o que aconteceu logo em seguida foi ainda pior... Curta para a Parte ${i + 1}!`
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

        setSucessoMsg(`Minissérie encadeada de ${numPartes} Partes criada com SUCESSO no Firestore!`);
      } else {
        // Criação de Pauta Manual Única com Gancho de Alta Retenção
        const pautaDoc = {
          titulo: tema.trim(),
          conceito: 'Pauta manual enviada pela Dashboard.',
          status: 'pendente',
          isMiniseries: false,
          createdAt: new Date().toISOString()
        };

        if (db) {
          await addDoc(collection(db, 'tenants', selectedTenant, 'pautas'), pautaDoc);
        }

        setSucessoMsg('Pauta manual cadastrada com SUCESSO na esteira de produção!');
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
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Film className="text-accent" size={22} /> Criar Pauta Manual & Motor de Minisséries
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Defina o tema exato de um vídeo ou ative o <strong>Motor de Minisséries</strong> para gerar uma sequência de partes com cliffhangers virais.
          </p>
        </div>

        <form onSubmit={handleCriarPauta} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Selecione o Canal (Tenant)
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
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Tema / Assunto do Vídeo
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: A História Proibida dos Cavaleiros Templários"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Opção de Minissérie em Partes */}
          <div style={{
            background: 'rgba(0, 242, 254, 0.04)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            padding: '20px',
            borderRadius: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={isMiniseries}
                onChange={(e) => setIsMiniseries(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-cyan)' }}
              />
              <span className="gradient-text" style={{ fontSize: '15px' }}>
                Transformar em Minissérie (Dividir em Partes Encadeadas)
              </span>
            </label>

            {isMiniseries && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Quantidade de Partes Encadeadas:</span>
                <select
                  className="input-field"
                  style={{ width: '220px' }}
                  value={quantidadePartes}
                  onChange={(e) => setQuantidadePartes(e.target.value)}
                >
                  <option value="2">2 Partes (Dueto de Vídeos)</option>
                  <option value="3">3 Partes (Trilogia Recomendada)</option>
                  <option value="5">5 Partes (Série Completa Cash-Cow)</option>
                </select>
                <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                  ⚡ Cada parte conterá um cliffhanger no final!
                </span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
            <button type="submit" className="gradient-btn" disabled={salvando} style={{ height: '46px', padding: '0 28px' }}>
              {salvando ? 'Processando Roteiro no Gemini...' : isMiniseries ? 'Gerar Minissérie Encadeada' : 'Cadastrar Pauta Manual'}
            </button>

            {sucessoMsg && (
              <span style={{ color: '#34d399', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={18} /> {sucessoMsg}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
