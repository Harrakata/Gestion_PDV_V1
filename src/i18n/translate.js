import { isEnglish } from './language';

// ════════════════════════════════════════════════════════════════════════════
//  Traduction à l'affichage.
//
//  Le dictionnaire (locales/en.json) a trois parties :
//   - text     : « Enregistrer » → « Save »
//   - patterns : « Ticket {} créé » → « Ticket {0} created » (textes assemblés)
//   - mixed    : texte JSX entrecoupé de valeurs ou de balises, un « ¦ » entre morceaux
//  Un texte absent s'affiche en français. `npm run i18n` liste ce qui manque.
// ════════════════════════════════════════════════════════════════════════════

export const isTranslated = isEnglish;

const CACHE_LIMIT = 8000;
let exact = new Map();
let patternsByWord = new Map();
let loosePatterns = [];
let mixedIndex = new Map();
let cache = new Map();

const normalize = (text) => text.replace(/[\u2019\u02bc]/g, "'").replace(/[\u00a0\u202f]/g, ' ');
const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/g;
const GLUED = '((?:e?s|x)?|[\\s.,;:(][\\s\\S]*?)';
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Remplit « {0} … {1} » avec les valeurs, dans l'ordre voulu par la traduction. */
const fill = (template, values) => template.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? '');

export const buildDictionary = ({ text = {}, patterns = {}, mixed = {} }) => {
  exact = new Map(Object.entries(text).map(([key, value]) => [normalize(key), value]));
  cache = new Map();

  patternsByWord = new Map();
  loosePatterns = [];
  Object.entries(patterns).forEach(([key, value]) => {
    const source = normalize(key);
    const pieces = source.split('{}');
    // Valeur collée à un mot (« contrôle{} ») : une marque de pluriel, ou une suite séparée.
    const regexp = pieces.map((piece, index) => (index === 0 ? '' : /[A-Za-zÀ-ÿ]$/.test(pieces[index - 1]) ? GLUED : '([\\s\\S]*?)') + escapeRegExp(piece)).join('');
    const entry = { regexp: new RegExp(`^${regexp}$`), value, weight: pieces.join('').length };
    // Classé par son mot entier le plus long ; à défaut, par son plus long morceau.
    const word = (source.replace(/\S*\{\}\S*/g, ' ').match(WORD) || []).sort((a, b) => b.length - a.length)[0];
    if (!word) {
      loosePatterns.push({ ...entry, piece: pieces.reduce((a, b) => (b.length > a.length ? b : a)) });
      return;
    }
    if (!patternsByWord.has(word)) patternsByWord.set(word, []);
    patternsByWord.get(word).push(entry);
  });
  // Le motif le plus précis d'abord.
  patternsByWord.forEach((list) => list.sort((a, b) => b.weight - a.weight));

  mixedIndex = new Map();
  Object.entries(mixed).forEach(([key, value]) => {
    const slots = key.split('¦').map((slot) => (slot === '{}' ? null : normalize(slot)));
    const at = slots.findIndex((slot) => slot !== null && /[A-Za-zÀ-ÿ]{2}/.test(slot));
    if (at < 0) return;
    const id = `${slots.length}|${at}|${slots[at]}`;
    if (!mixedIndex.has(id)) mixedIndex.set(id, []);
    mixedIndex.get(id).push({ slots, value });
  });
};

/** Charge le dictionnaire si besoin. À attendre avant le premier rendu. */
export const loadTranslations = async () => {
  if (!isTranslated) return;
  try {
    const { default: dictionary } = await import('./locales/en.json');
    buildDictionary(dictionary);
    watchCharts();
  } catch {
    /* dictionnaire indisponible : l'application reste en français */
  }
};

const fromPatterns = (text) => {
  if (text.length > 800) return null;
  let best = null;
  const test = (entry) => {
    if (best && best.weight >= entry.weight) return;
    const match = entry.regexp.exec(text);
    if (match) best = { weight: entry.weight, value: entry.value, values: match.slice(1) };
  };
  new Set(text.match(WORD) || []).forEach((word) => patternsByWord.get(word)?.forEach(test));
  loosePatterns.forEach((entry) => { if (text.includes(entry.piece)) test(entry); });
  return best ? fill(best.value, best.values.map(t)) : null;
};

// Textes joints à l'exécution (« novembre · Actif », « Planifiée, Annulée », « Agence : Gombe »).
const SEPARATORS = ['\n', ' · ', ' • ', ' — ', ' | ', ' / ', ' > ', ' : '];
const fromParts = (text) => {
  for (const separator of SEPARATORS) {
    if (!text.includes(separator)) continue;
    const parts = text.split(separator);
    const translated = parts.map(t);
    if (translated.some((part, index) => part !== parts[index])) return translated.join(separator === ' : ' ? ': ' : separator);
  }
  if (text.includes(', ')) {
    const parts = text.split(', ');
    if (parts.every((part) => exact.has(part))) return parts.map((part) => exact.get(part)).join(', ');
  }
  return null;
};

const translateCore = (core) => {
  const direct = exact.get(core);
  if (direct !== undefined) return direct;
  // « directeur régional » (libellé mis en minuscules) : l'entrée « Directeur régional ».
  if (/^[a-zà-ÿ]/.test(core) && core === core.toLowerCase()) {
    const capital = exact.get(core[0].toUpperCase() + core.slice(1));
    if (capital) return capital[0].toLowerCase() + capital.slice(1);
  }
  // « Nom * », « Agence : », « Recherche… », « 12 ligne(s) » : une seule entrée suffit.
  const tail = /^([\s\S]*?)(\s?\*|\s?:|…|\.\.\.)$/.exec(core);
  if (tail && exact.has(tail[1])) return exact.get(tail[1]) + tail[2].replace(/^\s(?=:)/, '');
  // Même phrase avec ou sans point final.
  if (core.endsWith('.')) {
    const bare = exact.get(core.slice(0, -1));
    if (bare !== undefined) return `${bare}.`;
  } else if (exact.has(`${core}.`)) return exact.get(`${core}.`).replace(/\.$/, '');
  const pattern = fromPatterns(core);
  if (pattern != null) return pattern;
  const lead = /^([\d\s.,%/+×–-]+)\s([\s\S]+)$/.exec(core);
  if (lead && exact.has(lead[2])) return `${lead[1]} ${exact.get(lead[2])}`;
  return fromParts(core);
};

/** Traduit un texte affiché (inchangé en français, ou s'il n'est pas au dictionnaire). */
export function t(text) {
  if (!isTranslated || typeof text !== 'string' || text.length < 2) return text;
  const known = cache.get(text);
  if (known !== undefined) return known;
  const normalized = normalize(text);
  const core = normalized.trim();
  let result = text;
  if (core) {
    const translated = translateCore(core);
    if (translated != null) {
      const start = normalized.indexOf(core);
      result = normalized.slice(0, start) + translated + normalized.slice(start + core.length);
    }
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(text, result);
  return result;
}

const matchMixed = (children) => {
  for (let i = 0; i < children.length; i += 1) {
    if (typeof children[i] !== 'string') continue;
    const candidates = mixedIndex.get(`${children.length}|${i}|${normalize(children[i])}`);
    const found = candidates?.find(({ slots }) => slots.every((slot, index) => (
      slot === null || (typeof children[index] === 'string' && normalize(children[index]) === slot)
    )));
    if (found) return found;
  }
  return null;
};

const translateChildren = (children) => {
  if (typeof children === 'string') return t(children);
  if (!Array.isArray(children) || !children.some((child) => typeof child === 'string')) return children;
  const mixed = matchMixed(children);
  if (!mixed) return children.map((child) => (typeof child === 'string' ? t(child) : child));
  const dynamic = children.filter((_, index) => mixed.slots[index] === null);
  return mixed.value.split(/(\{\d+\})/).filter((part) => part !== '').map((part) => {
    const index = /^\{(\d+)\}$/.exec(part);
    if (!index) return part;
    const value = dynamic[Number(index[1])];
    return typeof value === 'string' ? t(value) : value;
  });
};

const ATTRIBUTES = ['placeholder', 'title', 'alt', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'data-label'];
const RAW_TYPES = new Set(['style', 'script']);

/**
 * Propriétés d'un élément JSX, textes traduits. `translate="no"` exclut un élément ; un composant
 * `readsSourceText` reçoit le texte français (il le compare) et l'affiche, traduit, dans son propre JSX.
 */
export const translateProps = (type, props) => {
  if (!props || RAW_TYPES.has(type) || props.translate === 'no' || type?.readsSourceText) return props;
  let next = props;
  const set = (name, value) => {
    if (value === props[name]) return;
    if (next === props) next = { ...props };
    next[name] = value;
  };
  if (props.children != null) set('children', translateChildren(props.children));
  ATTRIBUTES.forEach((name) => { if (typeof props[name] === 'string') set(name, t(props[name])); });
  return next;
};

/** Document HTML produit hors de React (fiches imprimées). */
export const translateHtml = (html) => {
  if (!isTranslated || typeof DOMParser === 'undefined') return html;
  const page = new DOMParser().parseFromString(html, 'text/html');
  const walker = page.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!RAW_TYPES.has(node.parentElement?.localName)) node.nodeValue = t(node.nodeValue);
  }
  page.querySelectorAll('[alt], [title]').forEach((element) => ['alt', 'title'].forEach((name) => {
    if (element.hasAttribute(name)) element.setAttribute(name, t(element.getAttribute(name)));
  }));
  page.documentElement.lang = 'en';
  return `<!doctype html>\n${page.documentElement.outerHTML}`;
};

/**
 * Les graphiques écrivent leurs textes (légende, axes, infobulles) dans leur propre code :
 * on les traduit dans la page, avant l'affichage.
 */
function watchCharts() {
  if (typeof MutationObserver === 'undefined') return;
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement?.closest('.recharts-wrapper')) return;
      const value = t(node.nodeValue);
      if (value !== node.nodeValue) node.nodeValue = value;
    } else if (node.nodeType === Node.ELEMENT_NODE && (node.closest('.recharts-wrapper') || node.querySelector('.recharts-wrapper'))) {
      const label = node.getAttribute('aria-label');
      if (label && t(label) !== label) node.setAttribute('aria-label', t(label));
      node.childNodes.forEach(visit);
    }
  };
  new MutationObserver((records) => records.forEach((record) => {
    if (record.type === 'characterData') visit(record.target);
    else record.addedNodes.forEach(visit);
  })).observe(document.body, { childList: true, characterData: true, subtree: true });
}
