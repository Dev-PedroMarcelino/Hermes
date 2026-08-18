import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import ChannelDetailModal from './ChannelDetailModal';
import { Plus, Radio, Tag, Sparkles, Sliders, ArrowRight, Eye, Youtube, Share2, Layers } from 'lucide-react';

export default function GerenciadorCanais() {
  const [canais, setCanais] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  
  // Campos do Formulário Completo de Canal
  const [nome, setNome] = useState('');
  const [nicho, setNicho] = useState('');
  const [publicoAlvo, setPublicoAlvo] = useState('Jovens e Adultos (18-35 anos)');
  const [tomVoz, setTomVoz] = useState('pt-BR-AntonioNeural');
  const [frequencia, setFrequencia] = useState('2');
  const [promptIA, setPromptIA] = useState('Atue como um especialista em vídeos curtos e traga curiosidades impressionantes com um gancho forte nos primeiros 3 segundos.');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCanais(lista);
    }, (error) => {
      console.warn('Erro Firestore listeners:', error.message);
      setCanais([
        { 
          id: 'tenant_test_1787011929715', 
          name: 'Curiosidades Tech & IA', 
          niche: 'Tecnologia, IA e Futuro', 
          status: 'ACTIVE',
          aiPrompt: 'Crie roteiros curtos sobre inteligência artificial e futuro com frases curtas e misteriosas.',
          voiceTone: 'pt-BR-AntonioNeural',
          dailyFrequency: '2'
        },
        { 
          id: 'tenant_02', 
          name: 'Mundo Obscuro', 
          niche: 'Mistérios & História', 
          status: 'ACTIVE',
          aiPrompt: 'Crie roteiros sobre fatos históricos misteriosos e não contados nas escolas.',
          voiceTone: 'pt-BR-HumbertoNeural',
          dailyFrequency: '1'
        }
      ]);
    });

    return () => unsubscribe();
  }, []);

  const handleSalvarCanal = async (e) => {
    e.preventDefault();
    if (!nome.trim() || !nicho.trim()) return;

    setSalvando(true);
    try {
      const novoCanal = {
        name: nome.trim(),
        niche: nicho.trim(),
        targetAudience: publicoAlvo,
        voiceTone: tomVoz,
        dailyFrequency: frequencia,
        aiPrompt: promptIA.trim(),
        status: 'ACTIVE',
        language: 'pt-BR',
        scheduling: { cronExpression: frequencia === '2' ? '0 12,18 * * *' : '0 12 * * *' },
        createdAt: new Date().toISOString()
      };

      if (db) {
        await addDoc(collection(db, 'tenants'), novoCanal);
      }
      setNome('');
      setNicho('');
      setPromptIA('');
    } catch (err) {
      alert(`Erro ao adicionar canal: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Formulário Avançado de Criação de Canal */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '19px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus className="text-accent" size={22} /> Configurar & Cadastrar Novo Canal Dark
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Defina as regras da IA, nicho e tom de voz que o motor autônomo usará para gerar os conteúdos.
            </p>
          </div>
        </div>
        
        <form onSubmit={handleSalvarCanal} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Nome do Canal
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Mistérios da Ciência"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Nicho Principal do Conteúdo
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Ciência, Espaço e Física"
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Voz Neural Padrão (EdgeTTS)
              </label>
              <select
                className="input-field"
                value={tomVoz}
                onChange={(e) => setTomVoz(e.target.value)}
              >
                <option value="pt-BR-AntonioNeural">pt-BR - Antonio (Masculina Impactante)</option>
                <option value="pt-BR-FranciscaNeural">pt-BR - Francisca (Feminina Expressiva)</option>
                <option value="pt-BR-YaraNeural">pt-BR - Yara (Feminina Suave)</option>
                <option value="pt-BR-HumbertoNeural">pt-BR - Humberto (Masculina Grave)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Sparkles className="text-accent" size={16} /> Instrução / Prompt Personalizado da IA para este Canal
            </label>
            <textarea
              className="input-field"
              rows={3}
              placeholder="Descreva a personalidade da IA, estilo dos ganchos e tom das piadas ou mistério..."
              value={promptIA}
              onChange={(e) => setPromptIA(e.target.value)}
              required
              style={{ fontFamily: 'inherit', lineHeight: '1.4' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="gradient-btn" disabled={salvando} style={{ height: '46px', padding: '0 24px' }}>
              {salvando ? 'Cadastrando Canal...' : 'Criar Canal & Ativar Motor autônomo'}
            </button>
          </div>
        </form>
      </div>

      {/* Grid de Cards de Canais Interativos */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <h3 style={{ fontSize: '19px', fontWeight: 800, marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio className="text-accent" size={22} /> Canais Ativos no Sistema ({canais.length})
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Clique em qualquer card abaixo para abrir a <strong>Sala de Controle do Canal</strong>, ver prévias dos vídeos gerados, prévia do áudio, métricas e alterar regras da IA.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {canais.map((canal) => (
            <div
              key={canal.id}
              onClick={() => setSelectedChannel(canal)}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}
              className="channel-card"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '18px',
                    color: '#000'
                  }}>
                    {(canal.name || canal.nome || 'C')[0]}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700 }}>{canal.name || canal.nome}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{canal.niche || canal.nicho}</span>
                  </div>
                </div>

                <span className="badge badge-active">AUTÔNOMO</span>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                💬 "{canal.aiPrompt ? (canal.aiPrompt.substring(0, 70) + '...') : 'Configuração padrão ativada'}"
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Eye size={14} /> Acessar Workspace & Prévias
                </span>
                <ArrowRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal / Workspace do Canal Selecionado */}
      {selectedChannel && (
        <ChannelDetailModal
          channel={selectedChannel}
          onClose={() => setSelectedChannel(null)}
        />
      )}
    </div>
  );
}
