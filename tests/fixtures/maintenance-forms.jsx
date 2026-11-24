import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadTranslations } from '@/i18n/translate';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import '@/index.css';
import EquipmentManager from '@/pages/maintenance/EquipmentManager';
import StockDefectueuxTab from '@/pages/maintenance/StockDefectueuxTab';
import ConfigurationTab from '@/pages/maintenance/ConfigurationTab';
import MaintenanceTerminauxPage from '@/pages/chef_agence/MaintenanceTerminauxPage';

const ChefMaintenanceFixture = () => (
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<Outlet context={{ nomAgence: 'Agence test', chefDetails: {} }} />}>
        <Route index element={<MaintenanceTerminauxPage />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const screen = new URLSearchParams(location.search).get('screen');
await loadTranslations();
createRoot(document.getElementById('root')).render(
  <main id="main-content" className="container px-3 py-4"><div className="app-space-main maintenance-terminal-workspace">
    {screen === 'stock' ? <StockDefectueuxTab /> : screen === 'configuration'
      ? <ConfigurationTab showEquipmentManagement={false} /> : screen === 'chef'
        ? <ChefMaintenanceFixture /> : <EquipmentManager />}
  </div></main>
);
