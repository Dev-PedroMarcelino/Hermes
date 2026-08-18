'use client';

import { useState } from 'react';
import { X, Play, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function ForceTriggerModal({ isOpen, onClose, tenants = [] }) {
  const [selectedTenant, setSelectedTenant] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);

  if (!isOpen) return null;

  const handleTrigger = async (e) => {
    e.preventDefault();
    if (!selectedTenant) return;

    setLoading(true);
    setResultMessage(null);

    try {
      const response = await axios.post('http://localhost:3001/api/jobs/trigger', {
        tenantId: selectedTenant,
        customTopic: customTopic.trim() || undefined
      });

      setResultMessage({
        type: 'success',
        text: `Vídeo enviado para produção! Job ID: ${response.data.jobId}`
      });

      setTimeout(() => {
        onClose();
        setResultMessage(null);
        setCustomTopic('');
      }, 2000);
    } catch (err) {
      setResultMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Falha ao acionar motor de produção.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Forçar Geração de Vídeo</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleTrigger} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Selecione o Canal (Tenant)
            </label>
            <select
              className="input-field"
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              required
            >
              <option value="">-- Escolha um canal --</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.niche})</option>
              ))}
              {tenants.length === 0 && (
                <option value="tenant_tech_hacks_01">Curiosidades Tech (Demo)</option>
              )}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Tópico Específico (Opcional)
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: 5 IAs secretas que você precisa conhecer"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
            />
          </div>

          {resultMessage && (
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              background: resultMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: resultMessage.type === 'success' ? '#34d399' : '#f87171',
              border: `1px solid ${resultMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
            }}>
              {resultMessage.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="gradient-btn" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              Iniciar Produção
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
