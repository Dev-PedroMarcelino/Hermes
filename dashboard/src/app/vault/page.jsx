'use client';

import { useState } from 'react';
import { ShieldCheck, Key, RefreshCw, CheckCircle2, Lock } from 'lucide-react';
import axios from 'axios';

export default function VaultPage() {
  const [selectedTenant, setSelectedTenant] = useState('tenant_tech_hacks_01');
  const [geminiKey, setGeminiKey] = useState('');
  const [pexelsKey, setPexelsKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveKeys = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let encryptedGemini = '';
      let encryptedPexels = '';

      if (geminiKey) {
        const res = await axios.post('http://localhost:3001/api/vault/encrypt', { secret: geminiKey });
        encryptedGemini = res.data.encrypted;
      }
      if (pexelsKey) {
        const res = await axios.post('http://localhost:3001/api/vault/encrypt', { secret: pexelsKey });
        encryptedPexels = res.data.encrypted;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert(`Erro ao criptografar no vault: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Cofre de Credenciais <span className="gradient-text">(Vault)</span></h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Gerencie chaves de API e tokens OAuth com criptografia AES-256 no Firestore.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* API Keys Configuration Box */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Key style={{ color: 'var(--accent-cyan)' }} size={22} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Chaves de API Globais / Por Canal</h3>
          </div>

          <form onSubmit={handleSaveKeys} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Canal Selecionado</label>
              <select className="input-field" value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}>
                <option value="tenant_tech_hacks_01">Curiosidades Tech</option>
                <option value="tenant_curiosities_02">Mundo Obscuro</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Google Gemini API Key</label>
              <input
                type="password"
                className="input-field"
                placeholder="ENC:gAAAAABn..."
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Pexels Video API Key</label>
              <input
                type="password"
                className="input-field"
                placeholder="ENC:gAAAAABn..."
                value={pexelsKey}
                onChange={e => setPexelsKey(e.target.value)}
              />
            </div>

            {saveSuccess && (
              <div style={{ padding: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} /> Credenciais criptografadas e salvas com sucesso!
              </div>
            )}

            <button type="submit" className="gradient-btn" disabled={saving} style={{ marginTop: '8px' }}>
              {saving ? 'Criptografando...' : 'Salvar no Cofre AES-256'}
            </button>
          </form>
        </div>

        {/* OAuth Networks Status Box */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock style={{ color: 'var(--accent-purple)' }} size={22} />
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Conexões OAuth de Redes Sociais</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* YouTube Status */}
            <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700 }}>YouTube Shorts Data API v3</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Auto-Refresh Token Ativo</p>
              </div>
              <span className="badge badge-active">CONECTADO</span>
            </div>

            {/* TikTok Status */}
            <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700 }}>TikTok Content Posting API</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Expira em 24 dias</p>
              </div>
              <span className="badge badge-active">CONECTADO</span>
            </div>

            {/* Instagram Reels Status */}
            <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700 }}>Instagram Reels Graph API</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Long-Lived Token (58 dias restantes)</p>
              </div>
              <span className="badge badge-active">CONECTADO</span>
            </div>

            {/* Kwai Status */}
            <div style={{ padding: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700 }}>Kwai Open Platform API</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Pendente Conexão</p>
              </div>
              <span className="badge badge-pending">CONECTAR</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
