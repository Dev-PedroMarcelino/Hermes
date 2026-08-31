import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { Sparkles, Layers, Film, CheckCircle2, Zap, Cpu, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { triggerVideoJob } from '../lib/engineApi';
import CriarVideoModal from './CriarVideoModal';

export default function CriarPautaManual() {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tema, setTema] = useState('');
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

        // One queued job per episode. The engine's Gemini stage writes the
        // actual roteiro; here we only describe the episode's role in the arc.
        for (let i = 1; i <= numPartes; i++) {
          const isLast = i === numPartes;
          const instruction = [
            `Este é o episódio ${i} de uma minissérie de ${numPartes} partes sobre "${tema.trim()}".`,
            `Inclua "Parte ${i}" no título.`,
            'Abra com um gancho forte nos primeiros 3 segundos.',
            isLast
              ? 'Encerre com uma conclusão satisfatória e um convite para se inscrever no canal.'
              : `Encerre obrigatoriamente com um cliffhanger dramático chamando o público para a Parte ${i + 1}.`
          ].join(' ');

          await triggerVideoJob({
            tenantId: selectedTenant,
            customTopic: tema.trim(),
            customInstruction: instruction
          });
        }

        setSucessoMsg(`Minissérie de ${numPartes} partes enfileirada na esteira de produção!`);
      } else {
        const { jobId } = await triggerVideoJob({
          tenantId: selectedTenant,
          customTopic: tema.trim()
        });
        setSucessoMsg(`Job ${jobId} enfileirado. Acompanhe no Monitor de Produção.`);
      }

      setTema('');
      setTimeout(() => setSucessoMsg(null), 6000);
    } catch (err) {
      setErroMsg(err.message);
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

          {erroMsg && (
            <div style={{
              background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)',
              padding: '12px 14px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start'
            }}>
              <AlertCircle size={18} style={{ color: '#ff4757', flexShrink: 0, marginTop: '1px' }} />
              <span style={{ fontSize: '12px', lineHeight: 1.5 }}>{erroMsg}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                disabled={!tema.trim()}
                className="btn-secondary"
                style={{
                  height: '48px',
                  padding: '0 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid rgba(0, 255, 135, 0.35)',
                  color: '#00ff87',
                  background: 'rgba(0, 255, 135, 0.08)'
                }}
              >
                <ImageIcon size={18} /> Testar Prévia das Imagens
              </button>

              <button type="submit" className="gradient-btn" disabled={salvando} style={{ height: '48px', padding: '0 28px' }}>
                {salvando ? 'Enfileirando...' : isMiniseries ? 'Gerar Minissérie Encadeada' : 'Enfileirar Produção'}
              </button>
            </div>

            {sucessoMsg && (
              <span style={{ color: '#00ff87', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={16} /> {sucessoMsg}
              </span>
            )}
          </div>
        </form>
      </div>

      {showPreview && (
        <CriarVideoModal
          onClose={() => setShowPreview(false)}
          initialTenantId={selectedTenant}
          initialTopic={tema}
        />
      )}
    </div>
  );
}
