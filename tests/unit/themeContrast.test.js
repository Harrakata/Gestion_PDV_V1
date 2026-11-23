import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MIN_CONTRAST, buildBrandCss, buildBrandTokens, contrastRatio, parseHsl } from '../../src/lib/themeContrast.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const css = read('src/index.css');
const presets = [...read('src/lib/theme.js').matchAll(/name: '([^']+)',\s+hex: '[^']+', hsl: '([^']+)'/g)];

const block = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([\d.]+ [\d.]+% [\d.]+%)/g)].map((m) => [m[1], m[2]]));
};
const LIGHT = block(':root');
const DARK = { ...LIGHT, ...block('.dark') };

const assertPair = (tokens, text, surface, context) => {
  const ratio = contrastRatio(parseHsl(tokens[text]), parseHsl(tokens[surface]));
  assert.ok(ratio >= MIN_CONTRAST, `${context} : ${text} sur ${surface} = ${ratio.toFixed(2)}`);
};

const BRAND_PAIRS = [
  ['--primary-foreground', '--primary'], ['--primary', '--card'],
  ['--accent-foreground', '--accent'], ['--secondary-foreground', '--secondary'],
];

const assertBrand = (hsl, label) => {
  const tokens = buildBrandTokens(hsl);
  for (const [text, surface] of BRAND_PAIRS) {
    assertPair({ ...LIGHT, ...tokens.light }, text, surface, `${label} clair`);
    assertPair({ ...DARK, ...tokens.dark }, text, surface, `${label} sombre`);
  }
};

test('toutes les couleurs proposées sont lisibles, en clair comme en sombre', () => {
  assert.equal(presets.length, 11);
  for (const [, name, hsl] of presets) assertBrand(hsl, name);
});

test('les couleurs extrêmes choisies librement restent lisibles', () => {
  for (const hsl of ['0 0% 0%', '0 0% 100%', '60 100% 50%', '240 100% 50%', '0 100% 50%']) assertBrand(hsl, hsl);
});

test('les jetons par défaut sont lisibles', () => {
  const pairs = [
    ...BRAND_PAIRS, ['--foreground', '--background'],
    ['--muted-foreground', '--background'], ['--muted-foreground', '--muted'],
    ['--destructive-foreground', '--destructive'], ['--destructive', '--card'],
    ['--success-foreground', '--success'], ['--success', '--card'],
    ['--info-foreground', '--info'], ['--info', '--card'],
    ['--warning-foreground', '--warning'], ['--warning-muted-foreground', '--card'],
    ['--success-muted-foreground', '--success-muted'],
    ['--warning-muted-foreground', '--warning-muted'],
    ['--info-muted-foreground', '--info-muted'],
  ];
  for (const [text, surface] of pairs) {
    assertPair(LIGHT, text, surface, 'clair');
    assertPair(DARK, text, surface, 'sombre');
  }
});

test('la teinte du client est conservée sur tous les jetons de marque', () => {
  const { light, dark } = buildBrandTokens('217 91% 60%');
  for (const key of ['--primary', '--accent', '--accent-foreground', '--secondary', '--ring']) assert.match(light[key], /^217 /);
  for (const key of ['--primary', '--accent-foreground', '--ring']) assert.match(dark[key], /^217 /);
});

test('les valeurs par défaut d’index.css sont celles que calcule le thème', () => {
  const { light, dark } = buildBrandTokens('174 84% 32%');
  for (const [key, value] of Object.entries(light)) assert.equal(LIGHT[key], value, `clair ${key}`);
  for (const [key, value] of Object.entries(dark)) assert.equal(DARK[key], value, `sombre ${key}`);
});

test('une couleur invalide est ignorée sans casser le thème', () => {
  for (const value of [null, undefined, '', 'bleu', '#3b82f6', 'NaN 10% 10%', '1 2% 3%; } body { color: red']) {
    assert.equal(buildBrandTokens(value), null);
    assert.equal(buildBrandCss(value), '');
  }
});
