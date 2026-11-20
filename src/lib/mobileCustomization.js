// ════════════════════════════════════════════════════════════════════════════
//  Personnalisation de l'app mobile / PWA (Paramètres → « Personnalisation App
//  Mobile », app_settings.mobile_customization).
//
//  Les réglages sont exposés en variables CSS (--mobile-*) consommées par les
//  blocs « Mobile / PWA » de src/index.css. Ils sont appliqués au DÉMARRAGE pour
//  TOUS les utilisateurs (main.jsx), d'abord depuis un cache local (instantané)
//  puis depuis la base. Auparavant, ils n'étaient appliqués que sur la page
//  Paramètres, dans le navigateur de l'administrateur.
//
//  Valeurs par défaut = rendu actuel de l'app mobile.
//  Réglages obsolètes depuis la refonte (barre opaque, en-tête sans liseré) :
//  tabbarBlur, tabbarOpacity, headerAccentH — conservés en base, plus appliqués.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabaseClient';

export const MOBILE_CUSTOM_KEY = 'mobile_customization';
const CACHE_KEY = 'mobile_customization_cache';

export const MOBILE_SHADOWS = {
  legere: '0 6px 18px -10px rgba(15,23,42,0.22)',
  normale: '0 14px 34px -18px rgba(15,23,42,0.40)',
  prononcee: '0 20px 46px -12px rgba(15,23,42,0.55)',
};

export const MOBILE_DEFAULTS = Object.freeze({
  tabHeight: '4.5rem',   // hauteur de la barre d'onglets
  cardRadius: '1.5rem',  // arrondi de la barre d'onglets
  headerRadius: '2rem',  // arrondi de l'en-tête (2rem ≈ pilule)
  tabbarShadow: 'normale',
  tabIcon: '1.15rem',
  fontScale: 1,          // échelle d'affichage du contenu
  animations: true,
});

/** Applique les réglages (variables CSS + classe d'animations). */
export const applyMobileCustomization = (settings = {}) => {
  const s = { ...MOBILE_DEFAULTS, ...settings };
  const root = document.documentElement;
  root.style.setProperty('--mobile-tab-h', s.tabHeight);
  root.style.setProperty('--mobile-card-radius', s.cardRadius);
  root.style.setProperty('--mobile-header-radius', s.headerRadius);
  root.style.setProperty('--mobile-tabbar-shadow', MOBILE_SHADOWS[s.tabbarShadow] || MOBILE_SHADOWS.normale);
  root.style.setProperty('--mobile-tab-icon', s.tabIcon);
  root.style.setProperty('--mobile-font-scale', String(s.fontScale));
  document.body?.classList.toggle('mobile-no-anim', s.animations === false);
};

/** Démarrage : cache local (immédiat) puis valeur en base (mise à jour du cache). */
export const loadAndApplyMobileCustomization = async () => {
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    if (cached) applyMobileCustomization(JSON.parse(cached));
  } catch { /* cache indisponible */ }
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', MOBILE_CUSTOM_KEY).maybeSingle();
    if (!data?.value) return;
    applyMobileCustomization(data.value);
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(data.value)); } catch { /* quota */ }
  } catch { /* hors-ligne : le cache reste appliqué */ }
};

/** Après enregistrement dans Paramètres : applique et met le cache à jour. */
export const storeMobileCustomization = (value) => {
  applyMobileCustomization(value);
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* quota */ }
};
