import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import '@/index.css';
import { ConfirmDialogProvider } from '@/components/ConfirmDialogProvider';
import { FeatureFlagsProvider } from '@/hooks/useFeatureFlags';
import { applyTheme } from '@/lib/theme';

// Écrans denses, montés dans la structure réelle (#main-content > .app-space-main).
// Les requêtes sont simulées par les tests.
const today = new Date();
const creneaux = [{ debut: '09:00', fin: '13:00' }, { debut: '13:00', fin: '19:00' }];
const guichetieres = [['Awa', 'Diallo', 'M01'], ['Fatou', 'Keita', 'M02'], ['Mariam', 'Traoré', 'M03']]
  .map(([prenom, nom, matricule]) => ({ prenom, nom, matricule }));

const Formula = ({ Widget }) => {
  const [terms, setTerms] = useState([
    { operator: null, type: 'constante', value: 10, label: 'Base' },
    { operator: '/', type: 'constante', value: 2, label: 'Diviseur' },
    { operator: '-', type: 'constante', value: 1, label: 'Retenue' },
  ]);
  return <Widget formulaName="Test" terms={terms} onTermsChange={setTerms} />;
};

const SCREENS = {
  salaire: () => import('@/pages/exploitation/SalaireGuichetiereTab').then(({ default: C }) => <C canWrite />),
  tableau: () => import('@/pages/exploitation/TableauDeBordPage').then(({ default: C }) => <C />),
  centre: () => import('@/pages/exploitation/CentreOperationnelPage').then(({ default: C }) => <C />),
  mobi: () => import('@/pages/exploitation/PointsVenteMobiPage').then(({ default: C }) => <C />),
  parametres: () => import('@/pages/exploitation/ParametresPage').then(({ default: C }) => <C />),
  formule: () => import('@/pages/exploitation/parametres/FormulaBuilder').then(({ default: C }) => <Formula Widget={C} />),
  reparation: () => import('@/pages/maintenance/ReparationTerminauxTab').then(({ default: C }) => <C />),
  pieces: () => import('@/pages/maintenance/PiecesSousEnsemblesTab').then(({ default: C }) => <C />),
  planning: () => import('@/pages/chef_agence/MonPlanningPage').then(({ default: C }) => <C />),
  technicien: () => import('@/pages/technicien/MonPlanningMaintenancePage').then(({ default: C }) => <C technicien={{ id: 't1', nom: 'Test', prenom: 'Alice' }} />),
  guichetiere: () => import('@/pages/guichetiere/MonPlanningGuichetierePage').then(({ default: C }) => <C />),
  general: () => import('@/pages/exploitation/EtatPlanningGeneralPage').then(({ default: C }) => <C />),
  ccope: () => import('@/pages/exploitation/CcopePage').then(({ default: C }) => <C />),
  planification: () => import('@/components/maintenance/MaintenancePlanningSection').then(({ default: C }) => <C title="Planification de Maintenance" canManage />),
  maintenance: () => {
    try { localStorage.setItem('ps:maintenance-terminaux:outerTab', '"suivi"'); } catch { /* stockage indisponible */ }
    return import('@/pages/exploitation/MaintenanceTerminauxPage').then(({ default: C }) => <C />);
  },
  rapports: () => import('@/pages/exploitation/RapportsPage').then(({ default: C }) => <C />),
  enjeux: () => import('@/pages/exploitation/MobiEnjeuxRentabiliteView').then(({ default: C }) => (
    <C points={[{ pointVenteUid: 'u1', codePointVente: 'PDV-001', region: 'Kinshasa', agenceNom: 'Gombe', agenceCodePDV: '001', terminalReference: 'MOBI-1', guichetiereNom: 'Awa Test', guichetiereMatricule: '101', dateDebutValidite: '2026-01-01' }]}
      terminaux={[{ id: 't1', reference: 'MOBI-1', statut: 'Actif' }]} agences={[{ id: 'a1', nom: 'Gombe', region: 'Kinshasa', codePDV: '001' }]} canWrite onSwitchLegacy={() => {}} />
  )),
  chronologie: () => import('@/pages/pointage/PointageTimeline').then(({ default: C }) => (
    <C currentTime={new Date(today.setHours(14, 0))} creneaux={creneaux} currentCreneauIndex={1} guichetieresPlanifiees={guichetieres}
      pointagesData={{ M01: [{ creneauIndex: 0, heure: '09:05', timestamp: today.toISOString() }] }} />
  )),
  signature: () => import('@/pages/pointage/SignatureStep').then(({ default: C }) => <C onSubmit={() => {}} onReset={() => {}} />),
};

const params = new URLSearchParams(location.search);
const context = {
  canWriteCurrentPage: true, exploitationPermissions: {}, nomAgence: 'Agence test',
  guichetiereInfo: { id: 'g1', matricule: 'g1', nom: 'Diallo', prenom: 'Awa' }, guichetiereDetails: {},
  chefInfo: { nom: 'Test', prenom: 'Chef' }, chefDetails: { id: 'c1', agenceAssigne: 'Agence test' },
};

const [screen] = await Promise.all([
  (SCREENS[params.get('screen')] || SCREENS.reparation)(),
  applyTheme({ primaryHsl: '217 91% 60%', appearance: params.get('dark') === '1' ? 'dark' : 'light' }, { persist: false }),
]);

createRoot(document.getElementById('root')).render(
  <FeatureFlagsProvider>
    <ConfirmDialogProvider>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="/" element={<main id="main-content" className="container px-3 py-4"><div className="app-space-main">{screen}</div></main>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ConfirmDialogProvider>
  </FeatureFlagsProvider>,
);
