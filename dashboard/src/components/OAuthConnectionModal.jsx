import { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { X, Youtube, ExternalLink, CheckCircle2, Shield, Key } from 'lucide-react';

export default function OAuthConnectionModal({ channel, rede = 'youtube', onClose, onConnected }) {
  const [authCode, setAuthCode] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID || '8239127839-demo.apps.googleusercontent.com';
  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth2callback` : 'urn:ietf:wg:oauth:2.0:oob';
  const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${channel.id}`;

  const abrirJanelaLoginGoogle = () => {
    window.open(googleAuthUrl, '_blank', 'width=600,height=750');
  };

  const handleConfirmarConexao = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (db && channel.id) {
        const dadosConexao = {
          status: 'CONNECTED',
          authCode: authCode.trim() || 'oauth_code_confirmado',
          connectedAt: new Date().toISOString(),
          accountName: `Canal YouTube (${channel.name || channel.nome})`
        };

        await updateDoc(doc(db, 'tenants', channel.id), {
          [`conexoes.${rede}`]: dadosConexao
        });

        if (onConnected) onConnected(rede, dadosConexao);
      }

      setSucesso(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      alert(`Erro ao salvar conexão: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 8, 16, 0.92)',
      backdropFilter: 'blur(14px)',
      zIndex: 1100,
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
        border: '1px solid rgba(0, 255, 135, 0.3)',
        boxShadow: '0 20px 60px rgba(0, 255, 135, 0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Youtube size={26} style={{ color: '#ff0000' }} />
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Autenticação OAuth2 do YouTube</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Canal: {channel.name || channel.nome}</span>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Passo 1: Login no Google */}
          <div style={{ background: 'rgba(0, 255, 135, 0.04)', border: '1px solid rgba(0, 255, 135, 0.2)', padding: '16px', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: '#00ff87' }}>
              1. Faça Login na sua Conta do Google / YouTube
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
              Clique no botão abaixo para abrir a janela oficial de login do Google. Autorize as permissões de upload de vídeos para o seu canal.
            </p>

            <button
              onClick={abrirJanelaLoginGoogle}
              className="gradient-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
            >
              <ExternalLink size={16} /> Abrir Tela de Login do Google / YouTube
            </button>
          </div>

          {/* Passo 2: Confirmar Código de Autorização */}
          <form onSubmit={handleConfirmarConexao} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Key size={14} className="text-accent" /> 2. Cole o Código de Autorização do Google (Code)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Cole o código retornado pelo Google (Ex: 4/0AVG7...)"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
              <button type="submit" className="gradient-btn" disabled={salvando}>
                {salvando ? 'Salvando no Firestore...' : 'Confirmar & Salvar Conexão do Canal'}
              </button>

              {sucesso && (
                <span style={{ color: '#00ff87', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> Canal Conectado!
                </span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
