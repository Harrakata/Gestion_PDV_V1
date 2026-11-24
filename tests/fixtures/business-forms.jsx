import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadTranslations } from '@/i18n/translate';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import '@/index.css';
import RegionsPage from '@/pages/exploitation/RegionsPage';
import SecteursPage from '@/pages/exploitation/SecteursPage';
import AgencesPage from '@/pages/exploitation/AgencesPage';
import TechniciensPage from '@/pages/exploitation/TechniciensPage';
import GuichetieresPage from '@/pages/exploitation/GuichetieresPage';
import ChefsAgencePage from '@/pages/exploitation/ChefsAgencePage';
import ChefsSecteurPage from '@/pages/exploitation/ChefsSecteurPage';

const params = new URLSearchParams(location.search);
const Component = { regions: RegionsPage, secteurs: SecteursPage, agences: AgencesPage, techniciens: TechniciensPage, guichetieres: GuichetieresPage, chefs_agence: ChefsAgencePage, chefs_secteur: ChefsSecteurPage }[params.get('screen')] || RegionsPage;
await loadTranslations();
createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <Routes><Route element={<Outlet context={{ canWriteCurrentPage: params.get('readonly') !== '1' }} />}>
      <Route path="/" element={<main id="main-content" className="container px-3 py-4"><div className="app-space-main"><Component /></div></main>} />
    </Route></Routes>
  </MemoryRouter>
);
