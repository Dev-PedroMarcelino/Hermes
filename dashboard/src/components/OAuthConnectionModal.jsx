import { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { X, Youtube, ExternalLink, CheckCircle2, Shield, Key, AlertCircle } from 'lucide-react';

export default function OAuthConnectionModal({ channel, rede = 'youtube', onClose, onConnected }) {
  const [clientId, setClientId] = useState(import.meta.env.VITE_YOUTUBE_CLIENT_ID || '');
  const [authCode, setAuthCode] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth2callback` : 'https://developers.google.com/oauthplayground';
  const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');

  const getGoogleAuthUrl = () => {
    const finalClientId = clientId.trim() || 'SEU_CLIENT_ID_REAL.apps.googleusercontent.com';
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(finalClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${channel.id}`;
  };

  const abrirJanelaLoginGoogle = () => {
    if (!clientId.trim()) {
      alert('Por favor, informe o seu Client ID do Google Cloud Console antes de abrir o login.');
      return;
    }
    window.open(getGoogleAuthUrl(), '_blank', 'width=600,height=750');
  };

  const handleConfirmarConexao = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      if (db && channel.id) {
        const dadosConexao = {
          status: 'CONNECTED',
          clientId: clientId.trim(),
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
        maxWidth: '650px',
        maxHeight: '94vh',
        overflowY: 'auto',
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
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Conectar Canal do YouTube via OAuth2</h3>
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

        {/* Alerta explicativo do Erro 401 */}
        <div style={{ background: 'rgba(255, 71, 87, 0.08)', border: '1px solid rgba(255, 71, 87, 0.3)', padding: '14px', borderRadius: '12px', display: 'flex', gap: '10px' }}>
          <AlertCircle size={20} style={{ color: '#ff4757', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: '#e5e5e5', lineHeight: '1.5' }}>
            <strong>Por que ocorreu o "Erro 401: invalid_client"?</strong><br />
            O Google exige o seu <strong>Client ID oficial</strong> cadastrado no Google Cloud Console. Cole o seu Client ID abaixo para abrir a tela de permissões da sua conta real.
          </div>
        </div>

        <form onSubmit={handleConfirmarConexao} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Passo 1: Informar o Client ID */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Key size={14} className="text-accent" /> 1. Seu Client ID do Google Cloud Console
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: 123456789-abcdefg.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Crie gratuitamente em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: '#00ff87' }}>Google Cloud Credentials</a> (ID de cliente OAuth 2.0).
            </span>
          </div>

          {/* Passo 2: Botão de Login no Google */}
          <div style={{ background: 'rgba(0, 255, 135, 0.04)', border: '1px solid rgba(0, 255, 135, 0.2)', padding: '16px', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: '#00ff87' }}>
              2. Abrir Tela Oficial de Login do Google
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
              Após preencher o seu Client ID acima, clique no botão para autenticar a sua conta do YouTube.
            </p>

            <button
              type="button"
              onClick={abrirJanelaLoginGoogle}
              className="gradient-btn"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
            >
              <ExternalLink size={16} /> Fazer Login na Conta do Google
            </button>
          </div>

          {/* Passo 3: Código de Autorização */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Shield size={14} className="text-accent" /> 3. Cole o Código de Autorização / Token do Google
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Cole aqui o código gerado após o login (Ex: 4/0AVG7...)"
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
  );
}
