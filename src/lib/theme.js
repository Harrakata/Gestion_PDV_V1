import { supabase } from './supabaseClient';
import { buildBrandCss, buildBrandTokens, parseHsl } from './themeContrast';

export const THEME_STORAGE_KEY = 'theme_colors';
const THEME_LOCAL_KEY = 'app_theme_cache';

export const DEFAULT_THEME = Object.freeze({
  primaryHsl: '174 84% 32%',
  radius: 0.875,
  appearance: 'light',     // light | dark | auto (réglage du système)
  fontId: 'inter',
  zoom: 16,
  animations: true,
  pageBackground: 'tinted',
  pagePattern: 'none',
  shadowId: 'soft',
  stripedTables: false,
  contentWidth: 'normal',
  density: 'normal',
  sidebarStyle: 'light',
  sidebarWidth: 'normal',
  cardRail: true,
  highContrast: false,
});

// ── Couleurs ──────────────────────────────────────────────────────────────────
export const COLOR_PRESETS = [
  { name: 'Sarcelle',  hex: '#0d9488', hsl: '174 84% 32%' },
  { name: 'Vert',      hex: '#22c55e', hsl: '142 71% 45%' },
  { name: 'Émeraude',  hex: '#10b981', hsl: '160 84% 39%' },
  { name: 'Bleu',      hex: '#3b82f6', hsl: '217 91% 60%' },
  { name: 'Indigo',    hex: '#6366f1', hsl: '239 84% 67%' },
  { name: 'Violet',    hex: '#8b5cf6', hsl: '258 90% 66%' },
  { name: 'Rose',      hex: '#f43f5e', hsl: '350 89% 60%' },
  { name: 'Orange',    hex: '#f97316', hsl: '25 95% 53%'  },
  { name: 'Ambre',     hex: '#f59e0b', hsl: '38 92% 50%'  },
  { name: 'Cyan',      hex: '#06b6d4', hsl: '192 91% 44%' },
  { name: 'Ardoise',   hex: '#64748b', hsl: '215 16% 47%' },
];

export const APPEARANCE_PRESETS = [
  { id: 'light', name: 'Clair',  hint: 'Toujours clair' },
  { id: 'dark',  name: 'Sombre', hint: 'Toujours sombre' },
  { id: 'auto',  name: 'Auto',   hint: 'Suit le réglage de chaque appareil' },
];

// ── Police ────────────────────────────────────────────────────────────────────
// Les polices `googleFont` sont téléchargées à l'usage ; hors ligne, la police du
// système prend le relais.
export const FONT_PRESETS = [
  { id: 'inter',   name: 'Standard', stack: "'Inter', 'Segoe UI', system-ui, sans-serif" },
  { id: 'system',  name: 'Système',  stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'poppins', name: 'Poppins',  stack: "'Poppins', 'Segoe UI', sans-serif", googleFont: 'Poppins:wght@400;500;600;700' },
  { id: 'roboto',  name: 'Roboto',   stack: "'Roboto', 'Segoe UI', sans-serif", googleFont: 'Roboto:wght@400;500;700' },
  { id: 'nunito',  name: 'Nunito',   stack: "'Nunito Sans', 'Segoe UI', sans-serif", googleFont: 'Nunito+Sans:wght@400;600;700' },
  { id: 'serif',   name: 'Géorgia',  stack: "Georgia, 'Times New Roman', serif" },
];

// ── Zoom ──────────────────────────────────────────────────────────────────────
export const ZOOM_OPTIONS = [
  { label: 'Compacte',     value: 14, hint: 'Affichage dense' },
  { label: 'Normale',      value: 16, hint: 'Par défaut' },
  { label: 'Grande',       value: 18, hint: 'Lecture facilitée' },
  { label: 'Très grande',  value: 20, hint: 'Malvoyance, écran éloigné' },
];

// ── Fond de page ──────────────────────────────────────────────────────────────
export const PAGE_BACKGROUNDS = [
  { id: 'tinted',  name: 'Teinté',  hint: 'Couleur du client, légère', css: 'color-mix(in srgb, hsl(var(--primary)) 6%, hsl(var(--background)))' },
  { id: 'light',   name: 'Subtil',  hint: 'Teinte à peine visible',    css: 'color-mix(in srgb, hsl(var(--primary)) 3%, hsl(var(--background)))' },
  { id: 'neutral', name: 'Gris',    hint: 'Gris neutre',               css: 'hsl(var(--surface-subtle))' },
  { id: 'plain',   name: 'Uni',     hint: 'Même fond que les cartes',  css: 'hsl(var(--background))' },
];

export const PAGE_PATTERNS = [
  { id: 'none',     name: 'Aucun',     image: 'none', size: 'auto' },
  { id: 'gradient', name: 'Dégradé',   image: 'linear-gradient(135deg, hsl(var(--primary) / 0.07), transparent 60%)', size: 'auto' },
  { id: 'dots',     name: 'Pointillé', image: 'radial-gradient(hsl(var(--primary) / 0.16) 1px, transparent 1px)', size: '22px 22px' },
  { id: 'grid',     name: 'Grille',    image: 'linear-gradient(hsl(var(--primary) / 0.08) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.08) 1px, transparent 1px)', size: '28px 28px' },
];

// ── Ombre des cartes ──────────────────────────────────────────────────────────
// Cible les VRAIES cartes (composant Card = .text-card-foreground). Ne pas viser
// [class*="card"] : attrape aussi bg-card, dashboard-solid-cards… (ombre parasite).
export const SHADOW_PRESETS = [
  { id: 'none',   name: 'Aucune',   hint: 'Plat',      css: `.text-card-foreground, .card, .kpi-stat-card { box-shadow: none !important; }` },
  { id: 'soft',   name: 'Légère',   hint: 'Défaut',    css: '' },
  { id: 'medium', name: 'Moyenne',  hint: 'Élevée',    css: `.text-card-foreground, .card, .kpi-stat-card { box-shadow: 0 4px 24px -4px rgba(0,0,0,0.14) !important; }` },
  { id: 'strong', name: 'Marquée',  hint: 'Profonde',  css: `.text-card-foreground, .card, .kpi-stat-card { box-shadow: 0 12px 40px -8px rgba(0,0,0,0.22) !important; }` },
];

// ── Largeur du contenu ────────────────────────────────────────────────────────
export const WIDTH_PRESETS = [
  { id: 'narrow', name: 'Étroite',  hint: '1024px', css: `main, [data-content] { max-width: 1024px !important; margin-inline: auto !important; }` },
  { id: 'normal', name: 'Normale',  hint: '1280px', css: '' },
  { id: 'wide',   name: 'Large',    hint: '1600px', css: `main, [data-content] { max-width: 1600px !important; }` },
  { id: 'full',   name: 'Pleine',   hint: '100%',   css: `main, [data-content] { max-width: 100% !important; }` },
];

// ── Densité et menu : rendus par index.css (attributs data-* sur <html>) ──────
export const DENSITY_PRESETS = [
  { id: 'compact', name: 'Compacte', hint: 'Plus de lignes à l’écran' },
  { id: 'normal',  name: 'Normale',  hint: 'Par défaut' },
  { id: 'comfort', name: 'Aérée',    hint: 'Plus d’espace entre les éléments' },
];

export const SIDEBAR_STYLES = [
  { id: 'light',  name: 'Carte',   hint: 'Fond de carte' },
  { id: 'tinted', name: 'Teinté',  hint: 'Légère couleur du client' },
  { id: 'brand',  name: 'Couleur', hint: 'Fond plein à la couleur du client' },
];

export const SIDEBAR_WIDTHS = [
  { id: 'narrow', name: 'Étroit', css: '15.5rem' },
  { id: 'normal', name: 'Normal', css: '18rem' },
  { id: 'wide',   name: 'Large',  css: '20.5rem' },
];

// ── Ambiances : combinaisons prêtes (ni la couleur ni l'apparence ne changent) ──
export const THEME_AMBIANCES = [
  { id: 'standard', name: 'Standard', hint: 'Réglages d’origine',
    values: { radius: 0.875, zoom: 16, pageBackground: 'tinted', pagePattern: 'none', shadowId: 'soft', density: 'normal', sidebarStyle: 'light', cardRail: true, highContrast: false, stripedTables: false } },
  { id: 'sobre', name: 'Sobre', hint: 'Plat et neutre',
    values: { radius: 0.5, zoom: 16, pageBackground: 'neutral', pagePattern: 'none', shadowId: 'none', density: 'normal', sidebarStyle: 'light', cardRail: false, highContrast: false, stripedTables: false } },
  { id: 'affirme', name: 'Affirmé', hint: 'Menu à la couleur du client',
    values: { radius: 1.25, zoom: 16, pageBackground: 'tinted', pagePattern: 'gradient', shadowId: 'medium', density: 'normal', sidebarStyle: 'brand', cardRail: true, highContrast: false, stripedTables: false } },
  { id: 'dense', name: 'Dense', hint: 'Back-office, grands tableaux',
    values: { radius: 0.5, zoom: 14, pageBackground: 'light', pagePattern: 'none', shadowId: 'none', density: 'compact', sidebarStyle: 'light', cardRail: true, highContrast: false, stripedTables: true } },
  { id: 'lisible', name: 'Lisible', hint: 'Texte grand, contraste renforcé',
    values: { radius: 0.5, zoom: 18, pageBackground: 'plain', pagePattern: 'none', shadowId: 'none', density: 'comfort', sidebarStyle: 'light', cardRail: true, highContrast: true, stripedTables: true } },
];

// ── Normalisation ─────────────────────────────────────────────────────────────
const ids = (list) => list.map((item) => item.id);
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const LEGACY_BG = { default: ['tinted', 'none'], soft: ['neutral', 'none'], gradient: ['tinted', 'gradient'], dots: ['tinted', 'dots'], grid: ['tinted', 'grid'] };

/**
 * Réglages complets et sûrs à partir d'une valeur quelconque (base, cache, fichier
 * importé, ancienne version) : toute valeur inconnue reprend le défaut.
 */
export function normalizeTheme(input) {
  const value = input && typeof input === 'object' ? input : {};
  const d = DEFAULT_THEME;
  const [legacyBackground, legacyPattern] = LEGACY_BG[value.bgId] || [d.pageBackground, d.pagePattern];
  const radius = Number(value.radius);
  return {
    primaryHsl: parseHsl(value.primaryHsl) ? value.primaryHsl : d.primaryHsl,
    radius: value.radius != null && Number.isFinite(radius) ? Math.min(1.5, Math.max(0, radius)) : d.radius,
    appearance: pick(value.appearance, ids(APPEARANCE_PRESETS), value.darkMode === true ? 'dark' : d.appearance),
    fontId: pick(value.fontId, ids(FONT_PRESETS), d.fontId),
    zoom: pick(Number(value.zoom), ZOOM_OPTIONS.map((o) => o.value), d.zoom),
    animations: bool(value.animations, d.animations),
    pageBackground: pick(value.pageBackground, ids(PAGE_BACKGROUNDS), legacyBackground),
    pagePattern: pick(value.pagePattern, ids(PAGE_PATTERNS), legacyPattern),
    shadowId: pick(value.shadowId, ids(SHADOW_PRESETS), d.shadowId),
    stripedTables: bool(value.stripedTables, d.stripedTables),
    contentWidth: pick(value.contentWidth, ids(WIDTH_PRESETS), d.contentWidth),
    density: pick(value.density, ids(DENSITY_PRESETS), d.density),
    sidebarStyle: pick(value.sidebarStyle, ids(SIDEBAR_STYLES), d.sidebarStyle),
    sidebarWidth: pick(value.sidebarWidth, ids(SIDEBAR_WIDTHS), d.sidebarWidth),
    cardRail: bool(value.cardRail, d.cardRail),
    highContrast: bool(value.highContrast, d.highContrast),
  };
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslToHex(hsl) {
  const parts = hsl.split(' ');
  const h = Number(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Couleur réellement affichée en clair et en sombre (luminosité ajustée si besoin). */
export function getDisplayedColors(primaryHsl) {
  const tokens = buildBrandTokens(primaryHsl);
  if (!tokens) return null;
  const chosen = parseHsl(primaryHsl)[2];
  const describe = (value) => ({ hex: hslToHex(value), adjusted: Math.abs(parseHsl(value)[2] - chosen) >= 1 });
  return { light: describe(tokens.light['--primary']), dark: describe(tokens.dark['--primary']) };
}

const _loadedFonts = new Set();
function ensureGoogleFont(googleFont) {
  if (!googleFont || _loadedFonts.has(googleFont)) return;
  _loadedFonts.add(googleFont);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${googleFont}&display=swap`;
  document.head.appendChild(link);
}

function injectStyle(id, css) {
  let el = document.getElementById(id);
  if (!css) { el?.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  el.textContent = css;
}

const byId = (list, id) => list.find((item) => item.id === id);

// ── Apparence (clair / sombre / système) ──────────────────────────────────────
let currentAppearance = DEFAULT_THEME.appearance;
const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)');

function applyAppearance(appearance) {
  currentAppearance = appearance;
  const dark = appearance === 'dark' || (appearance === 'auto' && Boolean(systemDark()?.matches));
  document.documentElement.classList.toggle('dark', dark);
  syncStatusBarColor();
}

let watchesSystem = false;
function watchSystemAppearance() {
  if (watchesSystem) return;
  watchesSystem = true;
  systemDark()?.addEventListener?.('change', () => {
    if (currentAppearance === 'auto') applyAppearance('auto');
  });
}

// ── Barre d'état du téléphone (balise theme-color) ────────────────────────────
let statusBarMode = 'brand';

function syncStatusBarColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const token = statusBarMode === 'page' ? '--card' : '--primary';
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (parseHsl(value)) meta.setAttribute('content', hslToHex(value));
}

export function setStatusBarMode(mode) {
  statusBarMode = mode === 'page' ? 'page' : 'brand';
  syncStatusBarColor();
}

// ── Application du thème ──────────────────────────────────────────────────────
/**
 * Applique un thème complet (les réglages absents reprennent leur défaut).
 * `persist: false` : aperçu — rien n'est mémorisé dans le navigateur.
 */
export function applyTheme(input, { persist = true } = {}) {
  const theme = normalizeTheme(input);
  const root = document.documentElement;

  if (persist) {
    // Cache local : application instantanée au prochain chargement. `darkMode` reste
    // écrit pour les versions de l'app antérieures à `appearance`.
    try {
      localStorage.setItem(THEME_LOCAL_KEY, JSON.stringify({ ...theme, darkMode: theme.appearance === 'dark' }));
    } catch { /* quota exceeded */ }
  }

  injectStyle('theme-brand', buildBrandCss(theme.primaryHsl));
  root.style.setProperty('--radius', `${theme.radius}rem`);
  root.style.fontSize = `${theme.zoom}px`;

  const font = byId(FONT_PRESETS, theme.fontId);
  ensureGoogleFont(font.googleFont);
  document.body.style.fontFamily = font.stack;

  const pattern = byId(PAGE_PATTERNS, theme.pagePattern);
  root.style.setProperty('--page-background', byId(PAGE_BACKGROUNDS, theme.pageBackground).css);
  root.style.setProperty('--page-pattern', pattern.image);
  root.style.setProperty('--page-pattern-size', pattern.size);
  root.style.setProperty('--space-sidebar-size', byId(SIDEBAR_WIDTHS, theme.sidebarWidth).css);

  root.dataset.density = theme.density;
  root.dataset.sidebar = theme.sidebarStyle;
  root.dataset.cardRail = theme.cardRail ? 'on' : 'off';
  root.dataset.contrast = theme.highContrast ? 'high' : 'normal';

  injectStyle('theme-no-animations', theme.animations ? '' :
    '*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }');
  injectStyle('theme-shadow', byId(SHADOW_PRESETS, theme.shadowId).css);
  injectStyle('theme-striped', theme.stripedTables
    ? '#main-content tbody tr:nth-child(even):not(:hover) { background-color: hsl(var(--muted) / 0.5) !important; }'
    : '');
  injectStyle('theme-width', byId(WIDTH_PRESETS, theme.contentWidth).css);

  watchSystemAppearance();
  applyAppearance(theme.appearance);
  return theme;
}

/** Valeur enregistrée en base (`darkMode` conservé pour les anciennes versions). */
export const serializeTheme = (theme) => {
  const value = normalizeTheme(theme);
  return { ...value, darkMode: value.appearance === 'dark' };
};

export function applyThemeFromCache() {
  try {
    const cached = localStorage.getItem(THEME_LOCAL_KEY);
    if (cached) applyTheme(JSON.parse(cached));
  } catch { /* ignore */ }
}

export async function loadAndApplyTheme() {
  // 1. Application instantanée depuis le cache localStorage (0 ms)
  applyThemeFromCache();

  // 2. Synchronisation depuis Supabase (met à jour le cache si modifié)
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', THEME_STORAGE_KEY)
      .maybeSingle();
    if (data?.value) applyTheme(data.value);
  } catch {
    // Silently fail — le cache local garantit l'affichage correct
  }
}
