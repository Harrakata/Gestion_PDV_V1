/**
 * Dérive, à partir de LA couleur choisie par le client, tous les jetons de marque
 * (fond, texte posé dessus, survol, secondaire) pour les thèmes clair et sombre.
 *
 * La teinte et la saturation du client sont conservées ; seule la luminosité est
 * ajustée, et uniquement si nécessaire, pour garantir un contraste WCAG AA.
 * Fonctions pures (sans DOM ni réseau).
 */
export const MIN_CONTRAST = 4.5;

const WHITE = [0, 0, 100];
// Teinte la plus soutenue sous un texte de marque : bg-primary/10 sur le fond de
// page, lui-même teinté à 6 %.
const TINT = 0.16;
const DARK_SURFACE = [222, 47, 11]; // --card du thème sombre
const DARK_ACCENT = [217, 33, 20];
const DARK_SECONDARY = [217, 33, 17];
const DARK_TEXT = [210, 40, 98];

export const parseHsl = (value) => {
  const match = /^\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*$/.exec(String(value ?? ''));
  if (!match) return null;
  const [hue, saturation, lightness] = match.slice(1).map(Number);
  if (![hue, saturation, lightness].every(Number.isFinite)) return null;
  return [hue, Math.min(100, saturation), Math.min(100, lightness)];
};

const formatHsl = ([h, s, l]) => `${h} ${s}% ${l}%`;

const toRgb = ([h, s, l]) => {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  return [0, 8, 4].map((n) => {
    const k = (((n + h / 30) % 12) + 12) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
};

const luminance = (rgb) => rgb
  .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

const rgbContrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** `over` posé à `alpha` d'opacité sur `base` (ex. bg-primary/10 sur une carte). */
const blend = (over, base, alpha) => {
  const top = toRgb(over);
  return toRgb(base).map((v, i) => v * (1 - alpha) + top[i] * alpha);
};

export const contrastRatio = (a, b) => rgbContrast(toRgb(a), toRgb(b));

/** Lisible comme texte sur sa propre teinte (TINT), et comme fond au survol (90 %). */
const isReadable = (color, surface, onColor) =>
  rgbContrast(toRgb(color), blend(color, surface, TINT)) >= MIN_CONTRAST
  && rgbContrast(toRgb(onColor), toRgb(color)) >= MIN_CONTRAST
  && rgbContrast(toRgb(onColor), blend(color, surface, 0.9)) >= MIN_CONTRAST;

const adjustLightness = ([h, s, l], step, isValid) => {
  for (let light = l; light >= 0 && light <= 100; light += step) {
    if (isValid([h, s, light])) return [h, s, light];
  }
  return [h, s, step < 0 ? 0 : 100];
};

/**
 * @param {string} primaryHsl  « 217 91% 60% »
 * @returns {{ light: Record<string,string>, dark: Record<string,string> } | null}
 */
export function buildBrandTokens(primaryHsl) {
  const brand = parseHsl(primaryHsl);
  if (!brand) return null;
  const [hue, saturation] = brand;
  const softSaturation = Math.min(saturation, 76);

  const light = adjustLightness(brand, -1, (c) => isReadable(c, WHITE, WHITE));
  const dark = adjustLightness(brand, 1, (c) => isReadable(c, DARK_SURFACE, DARK_SURFACE));

  const accent = [hue, softSaturation, 95];
  const secondary = [hue, softSaturation, 96];
  const readableOn = (surface) => (c) => contrastRatio(c, surface) >= MIN_CONTRAST;

  return {
    light: {
      '--primary': formatHsl(light),
      '--primary-foreground': formatHsl(WHITE),
      '--ring': formatHsl(light),
      '--accent': formatHsl(accent),
      '--accent-foreground': formatHsl(adjustLightness([hue, saturation, Math.min(light[2], 40)], -1, readableOn(accent))),
      '--secondary': formatHsl(secondary),
      '--secondary-foreground': formatHsl(adjustLightness([hue, saturation, Math.min(light[2], 36)], -1, readableOn(secondary))),
    },
    dark: {
      '--primary': formatHsl(dark),
      '--primary-foreground': formatHsl(DARK_SURFACE),
      '--ring': formatHsl(dark),
      '--accent': formatHsl(DARK_ACCENT),
      '--accent-foreground': formatHsl(adjustLightness(dark, 1, readableOn(DARK_ACCENT))),
      '--secondary': formatHsl(DARK_SECONDARY),
      '--secondary-foreground': formatHsl(DARK_TEXT),
    },
  };
}

/** Feuille de style des jetons de marque (sélecteurs plus forts que ceux d'index.css). */
export function buildBrandCss(primaryHsl) {
  const tokens = buildBrandTokens(primaryHsl);
  if (!tokens) return '';
  const block = (selector, values) =>
    `${selector} { ${Object.entries(values).map(([key, value]) => `${key}: ${value};`).join(' ')} }`;
  return `${block('html:root', tokens.light)}\n${block('html:root.dark', tokens.dark)}`;
}
