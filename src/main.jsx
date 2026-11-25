
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';
import { initMonitoring } from '@/lib/monitoring';
import { initOfflineSync } from '@/lib/offlineSync';
import { initAutoHideScrollbars } from '@/lib/scrollbarVisibility';
import { loadAndApplyMobileCustomization } from '@/lib/mobileCustomization';
import { syncClientLanguage } from '@/i18n/clientLanguage';
import { resources } from '@/lib/resourceMode';
import { syncClientResourceMode } from '@/lib/clientResourceMode';
import { loadTranslations } from '@/i18n/translate';

// Monitoring d'erreurs optionnel (no-op si VITE_SENTRY_DSN absent).
initMonitoring();
// Synchro des opérations hors-ligne (au retour en ligne).
initOfflineSync();
// Barres de défilement visibles uniquement pendant l'interaction.
initAutoHideScrollbars();
// Personnalisation de l'app mobile (Paramètres) appliquée à TOUS les utilisateurs.
loadAndApplyMobileCustomization();
// Langue choisie par le client (Paramètres) : recharge l'app si elle a changé.
syncClientLanguage();
// Mode de ressources choisi par le client (Paramètres), appliqué au prochain chargement.
syncClientResourceMode();

// En anglais, le dictionnaire est chargé avant le premier affichage (immédiat en français).
loadTranslations().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    resources.strictMode ? <React.StrictMode><App /></React.StrictMode> : <App />
  );
});
