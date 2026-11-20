
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';
import { initMonitoring } from '@/lib/monitoring';
import { initOfflineSync } from '@/lib/offlineSync';
import { initAutoHideScrollbars } from '@/lib/scrollbarVisibility';
import { loadAndApplyMobileCustomization } from '@/lib/mobileCustomization';

// Monitoring d'erreurs optionnel (no-op si VITE_SENTRY_DSN absent).
initMonitoring();
// Synchro des opérations hors-ligne (au retour en ligne).
initOfflineSync();
// Barres de défilement visibles uniquement pendant l'interaction.
initAutoHideScrollbars();
// Personnalisation de l'app mobile (Paramètres) appliquée à TOUS les utilisateurs.
loadAndApplyMobileCustomization();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
