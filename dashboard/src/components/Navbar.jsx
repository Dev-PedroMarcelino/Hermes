'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Video, ShieldCheck, AlertTriangle, Layers, Zap } from 'lucide-react';

export default function Navbar({ onOpenTriggerModal }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Sala de Controle', href: '/', icon: Layers },
    { name: 'Canais (Tenants)', href: '/tenants', icon: Video },
    { name: 'Cofre de Credenciais', href: '/vault', icon: ShieldCheck },
    { name: 'Alertas & Erros', href: '/alerts', icon: AlertTriangle }
  ];

  return (
    <header style={{
      borderBottom: '1px solid var(--border-color)',
      background: 'rgba(10, 12, 16, 0.8)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{
        maxWWidth: '1400px',
        margin: '0 auto',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #00f2fe, #7f00ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            color: '#fff'
          }}>
            H
          </div>
          <div>
            <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.5px' }} className="gradient-text">
              HERMES
            </span>
            <span style={{ fontSize: '11px', display: 'block', color: 'var(--text-secondary)' }}>
              OmniChannel Content Factory
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(0, 242, 254, 0.08)' : 'transparent',
                  border: isActive ? '1px solid rgba(0, 242, 254, 0.2)' : '1px solid transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={18} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Action Button */}
        <button
          className="gradient-btn"
          onClick={onOpenTriggerModal}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Zap size={16} />
          Forçar Geração Agora
        </button>
      </div>
    </header>
  );
}
