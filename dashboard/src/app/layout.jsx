'use client';

import './globals.css';
import { useState } from 'react';
import Navbar from '../components/Navbar';
import ForceTriggerModal from '../components/ForceTriggerModal';

export default function RootLayout({ children }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <html lang="pt-BR">
      <head>
        <title>Hermes - OmniChannel Content Factory</title>
        <meta name="description" content="Motor de automação 100% autônomo para criação e distribuição de vídeos curtos" />
      </head>
      <body>
        <Navbar onOpenTriggerModal={() => setIsModalOpen(true)} />
        <main style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '32px 24px', flex: 1 }}>
          {children}
        </main>
        <ForceTriggerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </body>
    </html>
  );
}
