'use client';

import { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle, Bell } from 'lucide-react';

export default function AlertsPage() {
  const [alerts] = useState([
    {
      id: 'alert_01',
      tenantId: 'tenant_curiosities_02',
      network: 'KWAI',
      type: 'TOKEN_EXPIRED',
      message: "Credencial de KWAI expirou ou é inválida para o canal 'Mundo Obscuro'.",
      createdAt: new Date().toISOString(),
      resolved: false
    }
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 800 }}>Alertas de Sistema <span className="gradient-text">& Erros</span></h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Histórico de avisos sobre expiração de OAuth Refresh Tokens e falhas de renderização.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <CheckCircle size={32} style={{ color: '#34d399', marginBottom: '12px' }} />
            <p>Nenhum alerta pendente no sistema. Todos os canais estão operando normalmente!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {alerts.map((alert) => (
              <div key={alert.id} style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <ShieldAlert style={{ color: '#f87171' }} size={24} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>{alert.tenantId}</span>
                      <span className="badge badge-error" style={{ fontSize: '11px' }}>{alert.type}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{alert.message}</p>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(alert.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
