import { useEffect, useState } from 'react';
import { KeyRound, Save, Loader2, CheckCircle2, AlertCircle, Gauge, RotateCcw } from 'lucide-react';
import { getAppCredentialsStatus, saveAppCredentials } from '../lib/engineApi';

/**
 * Per-channel application credentials.
 *
 * These are NOT the social account — they identify Hermes to the platform. The
 * account itself is linked separately through the OAuth button.
 *
 * Why a channel would want its own app: the YouTube Data API quota is charged
 * per Google Cloud project (10.000 units/day, 1.600 per upload). Channels
 * sharing one app split ~6 uploads/day between them; a channel with its own
 * project gets its own budget, so several channels can produce in parallel.
 */

const NETWORKS = [
  {
    key: 'youtube',
    label: 'YouTube',
    fields: [
      { name: 'clientId', label: 'Client ID', placeholder: '123456-abc.apps.googleusercontent.com' },
      { name: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-...' }
    ],
    console: 'console.cloud.google.com → APIs e Serviços → Credenciais',
    quotaNote: 'Cada projeto do Google Cloud tem 10.000 unidades/dia e cada upload custa 1.600 (~6 vídeos/dia).'
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    fields: [
      { name: 'clientKey', label: 'Client Key', placeholder: 'aw...' },
      { name: 'clientSecret', label: 'Client Secret', placeholder: '...' }
    ],
    console: 'developers.tiktok.com → Manage apps',
    quotaNote: 'A auditoria de conteúdo é feita por app: sem ela, os posts saem como SELF_ONLY.'
  },
  {
    key: 'instagram',
    label: 'Instagram',
    fields: [
      { name: 'appId', label: 'App ID', placeholder: '1234567890' },
      { name: 'appSecret', label: 'App Secret', placeholder: '...' }
    ],
    console: 'developers.facebook.com → Meus apps → Configurações',
    quotaNote: 'A permissão instagram_content_publish é aprovada por app no App Review.'
  }
];

export default function AppCredentialsPanel({ tenantId }) {
  const [status, setStatus] = useState(null);
  const [inputs, setInputs] = useState({});
  const [savingNetwork, setSavingNetwork] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [erro, setErro] = useState(null);

  const carregarStatus = async () => {
    try {
      setStatus(await getAppCredentialsStatus(tenantId));
      setErro(null);
    } catch (err) {
      setErro(err.message);
    }
  };

  useEffect(() => {
    carregarStatus();
  }, [tenantId]);

  const handleSalvar = async (network, fields) => {
    setSavingNetwork(network);
    setFeedback(null);
    setErro(null);

    try {
      const credentials = Object.fromEntries(
        fields.map(f => [f.name, inputs[`${network}.${f.name}`] || ''])
      );
      const result = await saveAppCredentials({ tenantId, network, credentials });

      setFeedback({
        network,
        message: result.cleared
          ? 'Voltou a usar o app padrão do sistema.'
          : 'App próprio salvo. Reconecte a conta para os tokens passarem a valer por ele.'
      });

      // Never keep secrets in component state after they are stored
      setInputs(prev => {
        const next = { ...prev };
        fields.forEach(f => delete next[`${network}.${f.name}`]);
        return next;
      });

      await carregarStatus();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSavingNetwork(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h4 style={{ fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <KeyRound size={18} className="text-accent" /> App próprio deste canal
        </h4>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.6 }}>
          Isto <strong>não é a conta</strong> — é o aplicativo que representa o Hermes na plataforma.
          Dar um app próprio a este canal separa a cota de API dele dos demais, permitindo que
          vários canais publiquem em paralelo. Deixe em branco para usar o app padrão do sistema.
        </p>
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

      {NETWORKS.map(({ key, label, fields, console: consoleHint, quotaNote }) => {
        const info = status?.[key];
        const usaAppProprio = info?.source === 'tenant';

        return (
          <div key={key} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{label}</span>

              {info && (
                <span className={usaAppProprio ? 'badge badge-active' : 'badge badge-pending'}
                  style={{ fontSize: '10px' }}>
                  {usaAppProprio ? `App próprio ${info.hint || ''}` : 'App padrão do sistema'}
                </span>
              )}
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: 1.5 }}>
              <Gauge size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{quotaNote}</span>
            </div>

            {!usaAppProprio && info && !info.usable && (
              <div style={{ fontSize: '11px', color: '#ffb020', lineHeight: 1.5 }}>
                O app padrão também não está configurado no <code>.env</code> — este canal não consegue
                conectar {label} até você cadastrar um app aqui.
              </div>
            )}

            <div style={{ display: 'grid', gap: '8px' }}>
              {fields.map(field => (
                <input
                  key={field.name}
                  type={field.name.toLowerCase().includes('secret') ? 'password' : 'text'}
                  className="input-field"
                  placeholder={usaAppProprio ? '•••••• (salvo — digite para substituir)' : field.placeholder}
                  value={inputs[`${key}.${field.name}`] || ''}
                  onChange={e => setInputs(prev => ({ ...prev, [`${key}.${field.name}`]: e.target.value }))}
                  autoComplete="off"
                />
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleSalvar(key, fields)}
                className="btn-secondary"
                disabled={savingNetwork === key}
                style={{ fontSize: '12px', padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {savingNetwork === key
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Save size={13} />}
                Salvar app do canal
              </button>

              {usaAppProprio && (
                <button
                  type="button"
                  onClick={() => {
                    fields.forEach(f => setInputs(prev => ({ ...prev, [`${key}.${f.name}`]: '' })));
                    handleSalvar(key, fields);
                  }}
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  title="Remover o app próprio e voltar ao app padrão"
                >
                  <RotateCcw size={13} /> Voltar ao padrão
                </button>
              )}

              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{consoleHint}</span>
            </div>

            {feedback?.network === key && (
              <span style={{ fontSize: '12px', color: '#00ff87', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} /> {feedback.message}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
