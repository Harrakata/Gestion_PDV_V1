import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AssistantPanel from '../../src/components/assistant/AssistantPanel';
import '../../src/index.css';

const params = new URLSearchParams(window.location.search);
const request = async (body, signal) => {
  if (body.action === 'capabilities') return { mode: 'ai', menus: [{ key: 'maintenance-terminaux', title: 'Maintenance Terminaux', path: '/espace-exploitation/maintenance-terminaux' }] };
  if (params.has('slow')) await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 3000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
  if (params.has('denied')) throw Object.assign(new Error('Profil désactivé.'), { status: 403 });
  if (params.has('error')) throw new Error('Service de test indisponible.');
  return { mode: 'ai', answer: 'TERM01 est Actif. Son suivi préventif est à vérifier.', sources: [
    { id: 'term', title: 'Terminaux et suivi maintenance', path: '/espace-exploitation/maintenance-terminaux', consultedAt: '2026-10-05T10:00:00Z' },
    { id: 'bad', title: 'Lien non autorisé', path: 'https://example.invalid' },
  ] };
};

function Fixture() {
  const [destination, setDestination] = useState('');
  const [identity, setIdentity] = useState('first');
  return <main className="p-6">
    <h1 className="text-xl">Application de test</h1>
    <button type="button" onClick={() => setIdentity('second')}>Changer de compte</button>
    <output aria-label="Destination">{destination}</output>
    <AssistantPanel key={identity} space="espace-exploitation" currentTab="maintenance-terminaux" authenticated={!params.has('guest')} request={request} onNavigate={setDestination} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
