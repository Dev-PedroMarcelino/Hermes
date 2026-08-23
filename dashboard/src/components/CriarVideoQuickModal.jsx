import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { X, Plus, Sparkles, Layers, Cpu, CheckCircle2, Rocket, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { triggerVideoJob } from '../lib/engineApi';
import PreviewImagensModal from './PreviewImagensModal';

export default function CriarVideoQuickModal({ onClose, onCreated }) {
  const [canais, setCanais] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [isMiniseries, setIsMiniseries] = useState(false);
  const [quantidadePartes, setQuantidadePartes] = useState('3');
  const [criando, setCriando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCanais(lista);
      if (lista.length > 0 && !selectedTenant) {
        setSelectedTenant(lista[0].id);
      }
    }, (err) => console.warn('Erro ao carregar canais:', err.message));

    return () => unsubscribe();
  }, []);

  const handleCriarVideo = async (e) => {
    e.preventDefault();
    if (!assunto.trim() || !selectedTenant) return;

    setCriando(true);
    setSucesso(false);
    setErro('');

    try {
      // Jobs are queued through the engine, which owns the whole pipeline. The
      // roteiro itself is written by Gemini — the dashboard only supplies the
      // subject and the direction for the AI.
      if (isMiniseries) {
        const numPartes = parseInt(quantidadePartes, 10);

        for (let i = 1; i <= numPartes; i++) {
          const isLast = i === numPartes;
          const serieInstruction = [
            `Este é o episódio ${i} de uma minissérie de ${numPartes} partes sobre "${assunto.trim()}".`,
            `Inclua "Parte ${i}" no título.`,
            isLast
              ? 'Encerre a história com uma conclusão satisfatória e um convite para seguir o canal.'
              : `Termine obrigatoriamente com um cliffhanger dramático chamando o público para a Parte ${i + 1}.`,
            descricao.trim()
          ].filter(Boolean).join(' ');

          await triggerVideoJob({
            tenantId: selectedTenant,
            customTopic: assunto.trim(),
            customInstruction: serieInstruction
          });
        }
      } else {
        await triggerVideoJob({
          tenantId: selectedTenant,
          customTopic: assunto.trim(),
          customInstruction: descricao.trim() || null
        });
      }

      setSucesso(true);
      if (onCreated) onCreated();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCriando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 16, 0.92)',
      backdropFilter: 'blur(16px)',
      zIndex: 1200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '620px',
        padding: '28px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        border: '1px solid rgba(0, 255, 135, 0.4)',
        boxShadow: '0 20px 60px rgba(0, 255, 135, 0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #00ff87, #14a76c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Plus size={22} color="#06090c" />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Novo Vídeo Instantâneo pela IA</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Defina o assunto e a descrição para iniciar o processamento</span>
            </div>
          </div>

          <button
            onClick={onClose}
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

        <form onSubmit={handleCriarVideo} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Layers size={14} className="text-accent" /> Canal Destino
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
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Sparkles size={14} className="text-accent" /> Assunto / Tema do Vídeo
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: A Descoberta Secreta sob a Antártida"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Cpu size={14} className="text-accent" /> Descrição / Instrução Direta para a IA
            </label>
            <textarea
              className="input-field"
              rows={4}
              placeholder="Descreva detalhadamente como a IA deve criar o roteiro (Ex: Explicar em tom misterioso com ritmo acelerado, revelando 3 fatos chocantes com foco em retenção)..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
            />
          </div>

          {/* Opção de Minissérie */}
          <div style={{
            background: 'rgba(0, 255, 135, 0.04)',
            border: '1px solid rgba(0, 255, 135, 0.2)',
            padding: '14px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isMiniseries}
                onChange={(e) => setIsMiniseries(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-green)' }}
              />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#00ff87' }}>
                Dividir em Minissérie (Partes com Cliffhangers)
              </span>
            </label>

            {isMiniseries && (
              <select
                className="input-field"
                style={{ width: '140px', padding: '6px 10px', fontSize: '12px' }}
                value={quantidadePartes}
                onChange={(e) => setQuantidadePartes(e.target.value)}
              >
                <option value="2">2 Partes</option>
                <option value="3">3 Partes</option>
                <option value="5">5 Partes</option>
              </select>
            )}
          </div>

          {erro && (
            <div style={{
              background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)',
              padding: '12px 14px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start'
            }}>
              <AlertCircle size={18} style={{ color: '#ff4757', flexShrink: 0, marginTop: '1px' }} />
              <span style={{ fontSize: '12px', lineHeight: 1.5 }}>{erro}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                disabled={!assunto.trim()}
                className="btn-secondary"
                style={{
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid rgba(0, 255, 135, 0.35)',
                  color: '#00ff87',
                  background: 'rgba(0, 255, 135, 0.08)'
                }}
              >
                <ImageIcon size={16} /> Ver Prévia de Imagens
              </button>

              <button type="submit" className="gradient-btn" disabled={criando} style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Rocket size={18} /> {criando ? 'Enfileirando...' : 'OK - Iniciar Vídeo'}
              </button>
            </div>

            {sucesso && (
              <span style={{ color: '#00ff87', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={18} /> Enviado para a Esteira da IA!
              </span>
            )}
          </div>
        </form>
      </div>

      {showPreview && (
        <PreviewImagensModal
          onClose={() => setShowPreview(false)}
          initialTenantId={selectedTenant}
          initialTopic={assunto}
          initialInstruction={descricao}
        />
      )}
    </div>
  );
}
