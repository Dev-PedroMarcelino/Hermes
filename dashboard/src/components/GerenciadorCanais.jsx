import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { Plus, Radio, Layers, Tag } from 'lucide-react';

export default function GerenciadorCanais() {
  const [canais, setCanais] = useState([]);
  const [nome, setNome] = useState('');
  const [nicho, setNicho] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tenants'), (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCanais(lista);
    }, (error) => {
      console.warn('Erro Firestore listeners (usando lista local de fallback):', error.message);
      setCanais([
        { id: 'tenant_01', name: 'Curiosidades Tech', niche: 'Tecnologia & IA', status: 'ACTIVE' },
        { id: 'tenant_02', name: 'Mundo Obscuro', niche: 'Mistérios & História', status: 'ACTIVE' }
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
        status: 'ACTIVE',
        language: 'pt-BR',
        scheduling: { cronExpression: '0 12,18 * * *' },
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'tenants'), novoCanal);
      setNome('');
      setNicho('');
    } catch (err) {
      alert(`Erro ao adicionar canal: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Formulário de Adicionar Canal */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus className="text-accent" size={20} /> Cadastrar Novo Canal Dark
        </h3>
        
        <form onSubmit={handleSalvarCanal} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Nome do Canal
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: Segredos do Espaço"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Nicho / Tema do Conteúdo
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: Astronomia & Universo"
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="gradient-btn" disabled={salvando} style={{ height: '44px', whiteSpace: 'nowrap' }}>
            {salvando ? 'Salvando...' : 'Adicionar Canal'}
          </button>
        </form>
      </div>

      {/* Lista de Canais Existentes */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio className="text-accent" size={20} /> Canais Cadastrados no Banco ({canais.length})
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {canais.map((canal) => (
            <div key={canal.id} style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '16px', fontWeight: 700 }}>{canal.name || canal.nome}</h4>
                <span className="badge badge-active">ATIVO</span>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={14} /> {canal.niche || canal.nicho}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '4px' }}>
                ID: {canal.id}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
