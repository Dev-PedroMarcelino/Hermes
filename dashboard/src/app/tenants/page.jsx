'use client';

import { useState, useEffect } from 'react';
import { db } from '../../lib/firebaseClient';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { Plus, Video, Clock, Globe, Mic, CheckCircle } from 'lucide-react';

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    niche: '',
    brandIdentity: '',
    voiceId: 'pt-BR-AntonioNeural',
    cronExpression: '0 12,18 * * *',
    networks: ['YOUTUBE_SHORTS', 'TIKTOK', 'INSTAGRAM_REELS']
  });

  useEffect(() => {
    async function loadTenants() {
      try {
        const snap = await getDocs(collection(db, 'tenants'));
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (list.length > 0) {
          setTenants(list);
        } else {
          // Default dev demo tenants
          setTenants([
            {
              id: 'tenant_tech_hacks_01',
              name: 'Curiosidades Tech',
              niche: 'Tecnologia & IA',
              status: 'ACTIVE',
              brandIdentity: 'Futurista, acelerado',
              targetNetworks: ['YOUTUBE_SHORTS', 'TIKTOK', 'INSTAGRAM_REELS'],
              scheduling: { cronExpression: '0 12,18 * * *' }
            },
            {
              id: 'tenant_curiosities_02',
              name: 'Mundo Obscuro',
              niche: 'Mistérios & Fatos',
              status: 'ACTIVE',
              brandIdentity: 'Suspense, envolvente',
              targetNetworks: ['YOUTUBE_SHORTS', 'KWAI'],
              scheduling: { cronExpression: '0 15 * * *' }
            }
          ]);
        }
      } catch (err) {
        console.warn('Firestore fetch fallback:', err.message);
      }
    }
    loadTenants();
  }, []);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    try {
      const newTenant = {
        name: formData.name,
        niche: formData.niche,
        brandIdentity: formData.brandIdentity,
        status: 'ACTIVE',
        language: 'pt-BR',
        scheduling: { cronExpression: formData.cronExpression },
        contentConfig: { voiceId: formData.voiceId, ttsSpeed: '+10%' },
        targetNetworks: formData.networks,
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'tenants'), newTenant);
      setTenants([...tenants, { id: `tenant_${Date.now()}`, ...newTenant }]);
      setIsModalOpen(false);
      setFormData({ name: '', niche: '', brandIdentity: '', voiceId: 'pt-BR-AntonioNeural', cronExpression: '0 12,18 * * *', networks: ['YOUTUBE_SHORTS'] });
    } catch (err) {
      alert(`Erro ao criar canal: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Gestão de Canais <span className="gradient-text">(Tenants)</span></h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Cadastre e gerencie a identidade visual e agendamento de cada canal dark.</p>
        </div>
        <button className="gradient-btn" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Novo Canal (Tenant)
        </button>
      </div>

      {/* Tenants Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {tenants.map((t) => (
          <div key={t.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t.name}</h3>
                <span style={{ fontSize: '13px', color: 'var(--accent-cyan)' }}>{t.niche}</span>
              </div>
              <span className={`badge ${t.status === 'ACTIVE' ? 'badge-active' : 'badge-error'}`}>
                {t.status}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={16} /> <strong>Identidade:</strong> {t.brandIdentity || 'Padrão'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} /> <strong>Cron:</strong> {t.scheduling?.cronExpression || 'Manual'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mic size={16} /> <strong>Voz:</strong> {t.contentConfig?.voiceId || 'pt-BR-AntonioNeural'}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {t.targetNetworks?.map((net) => (
                <span key={net} className="badge badge-blue" style={{ fontSize: '11px' }}>
                  {net}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Tenant Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Cadastrar Novo Canal Dark</h3>
            <form onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Nome do Canal</label>
                <input type="text" className="input-field" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Curiosidades da Ciência" />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Nicho</label>
                <input type="text" className="input-field" required value={formData.niche} onChange={e => setFormData({ ...formData, niche: e.target.value })} placeholder="Ex: Ciência, Espaço e Tecnologia" />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Identidade de Marca & Tom</label>
                <input type="text" className="input-field" value={formData.brandIdentity} onChange={e => setFormData({ ...formData, brandIdentity: e.target.value })} placeholder="Ex: Tom misterioso, edições rápidas" />
              </div>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Voz Sintetizada (edge-tts)</label>
                <select className="input-field" value={formData.voiceId} onChange={e => setFormData({ ...formData, voiceId: e.target.value })}>
                  <option value="pt-BR-AntonioNeural">pt-BR-AntonioNeural (Masculina)</option>
                  <option value="pt-BR-FranciscaNeural">pt-BR-FranciscaNeural (Feminina)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="gradient-btn">Salvar Canal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
