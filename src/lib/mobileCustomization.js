// ════════════════════════════════════════════════════════════════════════════
//  Personnalisation de l'app mobile / PWA (Paramètres → « Personnalisation App
//  Mobile », app_settings.mobile_customization).
//
//  Les réglages deviennent des variables CSS (--mobile-*) et des attributs
//  data-mobile-* sur <html>, consommés par les blocs « Mobile / PWA » de
//  src/index.css. Ils sont appliqués au DÉMARRAGE pour TOUS les utilisateurs
//  (main.jsx), d'abord depuis un cache local (instantané) puis depuis la base.
//
//  Valeurs par défaut = rendu actuel de l'app mobile.
//  Réglages obsolètes (barre opaque, en-tête sans liseré) : tabbarBlur,
//  tabbarOpacity, headerAccentH — ignorés. Arrondis : cardRadius et headerRadius sont
//  ignorés aussi, l'app entière suit « Arrondi des coins » (lib/theme.js).
// ════════════════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { setStatusBarMode } from '@/lib/theme';

export const MOBILE_CUSTOM_KEY = 'mobile_customization';
const CACHE_KEY = 'mobile_customization_cache';

export const MOBILE_SHADOWS = {
  legere: '0 6px 18px -10px rgba(15,23,42,0.22)',
  normale: '0 14px 34px -18px rgba(15,23,42,0.40)',
  prononcee: '0 20px 46px -12px rgba(15,23,42,0.55)',
};

export const MOBILE_DEFAULTS = Object.freeze({
  tabHeight: '4.5rem',   // hauteur de la barre d'onglets
  tabStyle: 'floating',  // barre flottante | collée au bas de l'écran
  tabActive: 'soft',     // onglet actif : teinté | plein
  tabLabels: 'always',   // libellés : toujours | onglet actif | masqués
  tabCount: 4,           // raccourcis avant « Plus »
  tabbarShadow: 'normale',
  tabIcon: '1.15rem',
  controlHeight: 36,     // hauteur des boutons, listes et champs (px)
  cardDensity: 'compact',
  fontScale: 1,          // échelle d'affichage du contenu
  statusBar: 'brand',    // barre d'état : couleur du client | fond des cartes
  animations: true,
});

export const MOBILE_OPTIONS = {
  tabHeight: [{ value: '4rem', label: 'Compacte' }, { value: '4.5rem', label: 'Normale' }, { value: '5rem', label: 'Grande' }],
  tabStyle: [{ value: 'floating', label: 'Flottante' }, { value: 'full', label: 'Pleine largeur' }],
  tabActive: [{ value: 'soft', label: 'Teinté' }, { value: 'solid', label: 'Plein' }],
  tabLabels: [{ value: 'always', label: 'Toujours' }, { value: 'active', label: 'Onglet actif' }, { value: 'none', label: 'Icônes seules' }],
  tabCount: [{ value: 3, label: '3' }, { value: 4, label: '4' }],
  tabbarShadow: [{ value: 'legere', label: 'Légère' }, { value: 'normale', label: 'Normale' }, { value: 'prononcee', label: 'Prononcée' }],
  tabIcon: [{ value: '1rem', label: 'Petite' }, { value: '1.15rem', label: 'Normale' }, { value: '1.35rem', label: 'Grande' }],
  controlHeight: [{ value: 36, label: 'Compacte · 36' }, { value: 40, label: 'Moyenne · 40' }, { value: 44, label: 'Terrain · 44' }],
  cardDensity: [{ value: 'compact', label: 'Compactes' }, { value: 'comfort', label: 'Aérées' }],
  fontScale: [{ value: 0.9, label: 'Compacte · 90 %' }, { value: 1, label: 'Normale · 100 %' }, { value: 1.1, label: 'Confort · 110 %' }, { value: 1.2, label: 'Grande · 120 %' }],
  statusBar: [{ value: 'brand', label: 'Couleur du client' }, { value: 'page', label: 'Fond de l’app' }],
};

/** Réglages prêts à l'emploi. */
export const MOBILE_PROFILES = [
  { id: 'standard', name: 'Standard', hint: 'Réglages d’origine', values: { ...MOBILE_DEFAULTS } },
  { id: 'terrain', name: 'Terrain', hint: 'Gros boutons, lecture en mouvement',
    values: { controlHeight: 44, fontScale: 1.1, tabHeight: '5rem', tabIcon: '1.35rem', tabLabels: 'always', tabActive: 'solid', tabCount: 3, cardDensity: 'comfort' } },
  { id: 'dense', name: 'Dense', hint: 'Plus d’informations à l’écran',
    values: { controlHeight: 36, fontScale: 0.9, tabHeight: '4rem', tabIcon: '1rem', tabLabels: 'active', tabActive: 'soft', tabCount: 4, cardDensity: 'compact' } },
  { id: 'epure', name: 'Épuré', hint: 'Barre pleine largeur, icônes seules',
    values: { controlHeight: 40, fontScale: 1, tabHeight: '4rem', tabStyle: 'full', tabLabels: 'none', tabActive: 'soft', tabbarShadow: 'legere', cardDensity: 'comfort', statusBar: 'page' } },
];

/** Réglages complets et sûrs : toute valeur inconnue reprend le défaut. */
export const normalizeMobile = (input) => {
  const value = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const [key, fallback] of Object.entries(MOBILE_DEFAULTS)) {
    const allowed = MOBILE_OPTIONS[key]?.map((option) => option.value);
    if (allowed) result[key] = allowed.includes(value[key]) ? value[key] : fallback;
    else result[key] = typeof value[key] === typeof fallback ? value[key] : fallback;
  }
  return result;
};

// ── Réglages courants, lisibles par les composants (nombre de raccourcis) ──────
let current = normalizeMobile();
const listeners = new Set();
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useMobileCustomization = () => useSyncExternalStore(subscribe, () => current, () => current);

/**
 * Applique les réglages (variables CSS, attributs, barre d'état).
 * `persist: false` : aperçu — rien n'est mémorisé dans le navigateur.
 */
export const applyMobileCustomization = (settings, { persist = false } = {}) => {
  const s = normalizeMobile(settings);
  const root = document.documentElement;
  root.style.setProperty('--mobile-tab-h', s.tabHeight);
  root.style.setProperty('--mobile-tabbar-shadow', MOBILE_SHADOWS[s.tabbarShadow]);
  root.style.setProperty('--mobile-tab-icon', s.tabIcon);
  root.style.setProperty('--mobile-font-scale', String(s.fontScale));
  root.style.setProperty('--mobile-control-h', `max(${s.controlHeight}px, ${s.controlHeight / 16}rem)`);
  root.dataset.mobileTabStyle = s.tabStyle;
  root.dataset.mobileTabActive = s.tabActive;
  root.dataset.mobileTabLabels = s.tabLabels;
  root.dataset.mobileCards = s.cardDensity;
  document.body?.classList.toggle('mobile-no-anim', s.animations === false);
  setStatusBarMode(s.statusBar);
  current = s;
  listeners.forEach((listener) => listener());
  if (persist) {
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* quota */ }
  }
  return s;
};

/** Démarrage : cache local (immédiat) puis valeur en base (mise à jour du cache). */
export const loadAndApplyMobileCustomization = async () => {
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    if (cached) applyMobileCustomization(JSON.parse(cached));
  } catch { /* cache indisponible */ }
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', MOBILE_CUSTOM_KEY).maybeSingle();
    if (data?.value) applyMobileCustomization(data.value, { persist: true });
  } catch { /* hors-ligne : le cache reste appliqué */ }
};
