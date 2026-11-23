import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Calendar, Clipboard, Wrench } from 'lucide-react';
import Layout from '@/components/Layout';
import SpaceShell from '@/components/SpaceShell';
import PageHeader from '@/components/ui/page-header';
import '@/index.css';

const sections = [
  { key: 'planning', label: 'Mon planning', icon: <Calendar /> },
  { key: 'rapports', label: 'Mes rapports', icon: <Clipboard /> },
  { key: 'maintenance', label: 'Maintenance', icon: <Wrench />, disabled: true },
  { key: 'agenda', label: 'Agenda', icon: <Calendar />, to: '/espace-guichetiere/agenda' },
];

function Page({ activeKey }) {
  if (activeKey === 'rapports') throw new Error('Erreur simulée du rapport');
  return <PageHeader title={activeKey === 'agenda' ? 'Agenda' : 'Mon planning'} icon={<Calendar />} />;
}

function TestSpace() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState('planning');
  const { pathname } = useLocation();
  const activeKey = pathname.endsWith('/agenda') ? 'agenda' : section;
  return (
    <SpaceShell
      profile={{ name: 'Profil test', initials: 'PT', role: 'Guichetière' }}
      menuOpen={menuOpen}
      onMenuOpenChange={setMenuOpen}
      menuItems={sections.map((item) => ({
        ...item,
        active: activeKey === item.key,
        onClick: () => setSection(item.key),
      }))}
      onProfile={() => {}}
      onLogout={() => {}}
    >
      <Page activeKey={activeKey} />
    </SpaceShell>
  );
}

createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={['/espace-guichetiere']}>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/espace-guichetiere/*" element={<TestSpace />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
