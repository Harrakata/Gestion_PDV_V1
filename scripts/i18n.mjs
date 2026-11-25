// Textes à traduire (français → anglais).
//   npm run i18n                 liste ce qui manque au dictionnaire
//   npm run i18n -- --json f     écrit tous les textes trouvés dans un fichier JSON
//   npm run i18n -- --unused     liste les entrées du dictionnaire devenues inutiles
//
// Le code reste en français. Un texte manquant s'affiche en français : ce n'est jamais
// bloquant. Ajouter la traduction dans src/i18n/locales/en.json, ou le texte dans
// ignored.json s'il ne se traduit pas.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const types = require('@babel/types');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICTIONARY = path.join(root, 'src/i18n/locales/en.json');
// Textes à ne pas traduire (identiques, sigles, code) : connus, mais pas livrés avec l'application.
const IGNORED = path.join(root, 'src/i18n/locales/ignored.json');
const EXTRA_FILES = ['supabase/functions/_shared/assistantKnowledge.js', 'supabase/functions/_shared/accountManager.js'];

const LETTERS = /[A-Za-zÀ-ÿ]{2}/;
const ACCENT = /[À-ÿ]/;

// Classes CSS, sélecteurs, requêtes, identifiants… : tout ce qui n'est pas du texte.
const isClassList = (s) => !/[À-ÿ?!'’]/.test(s)
  && /(^|\s)!?-?(?:[a-z-]+:)*(flex|grid|block|inline|inline-flex|hidden|absolute|relative|fixed|sticky|text-|bg-|border|rounded|p[xytrbl]?-\d|m[xytrbl]?-|w-|h-|gap-|space-[xy]-|font-|items-|justify-|min-|max-|shrink|grow|overflow|animate-|opacity-|z-\d|ring|shadow|cursor-|transition|truncate|col-span|row-span|uppercase|leading-|tracking-|whitespace-|object-|from-|to-|via-|fill-|stroke-|divide-|sr-only|space-sidebar|app-)/.test(s)
  && !/[.:;]\s|,\s[a-zà-ÿ]+\s/.test(s);
const isCode = (s) => /^(https?:|\/|data:|#|\.\/|\.\.\/|@\/|\*|--|<)/.test(s)
  || /^[a-z0-9_.\-:/#@%[\]()|*=,&?+"'~>]+$/.test(s)
  || /^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(s)
  || /^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)+$/.test(s)
  || /^[a-z]+([A-Z][a-z0-9]*)+$/.test(s)
  || /^(hsl|rgb|rgba|repeat|minmax|calc|var|url|linear-gradient|radial-gradient|translate|rotate|scale|inset|max|min|clamp|cubic-bezier)\(/.test(s)
  || /^-?[\d.]+(px|rem|em|vh|vw|fr|ms|s|%)\b/.test(s) || /^(solid|dashed) /.test(s)
  || /^\[[\w-]+/.test(s) || /^[.#][\w-]+(\s|$|\[|:)/.test(s) || /^\w+\[[\w-]+/.test(s)
  || /^[\w"*:().!]+(\s*,\s*[\w"*:().!]+)+$/.test(s) && !ACCENT.test(s) && !/(^|,\s*)[A-Z]/.test(s)
  || /^(select|insert|update|delete|create|alter|from|where)\s/i.test(s) && /[_*=]/.test(s)
  || /^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]/.test(s) && !/[a-z]{4}/.test(s)
  || /^(image|text|application|audio|video)\//.test(s) || /^[dMyEHhms':/ ,.-]+$/.test(s)
  || /charset=|;base64/.test(s);
export const isText = (value) => {
  const s = value.trim();
  return s.length >= 2 && LETTERS.test(s) && !isCode(s) && !isClassList(s);
};

const CODE_ATTRIBUTES = /^(className|id|key|type|variant|size|name|href|src|srcSet|to|role|htmlFor|d|viewBox|.*ClassName|stroke.*|fill|dataKey|data-(?!label).*|value|align|side|mode|tone|rel|target|accept|method|path|autoComplete|inputMode|as|color|shape|strategy|xmlns|points|transform|preserveAspectRatio|gradientUnits|offset|translate|media|capture|loading|decoding|spaceKey|screen|where)$/;
const CODE_CALLS = new Set(['from', 'select', 'eq', 'neq', 'in', 'order', 'rpc', 'channel', 'is', 'or', 'not', 'like', 'ilike', 'gte', 'lte', 'gt', 'lt', 'match', 'querySelector', 'querySelectorAll', 'closest', 'addEventListener', 'removeEventListener', 'getItem', 'setItem', 'removeItem', 'usePageState', 'cn', 'invoke', 'schema', 'on', 'matches', 'matchMedia', 'createElement', 'RegExp', 'getElementById', 'setAttribute', 'getAttribute', 'setProperty', 'getPropertyValue', 'describeError', 'reportError', 'cachedQuery', 'CustomEvent', 'Event', 'lazy', 'cva', 'createContext', 'localeCompare', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'NumberFormat', 'DateTimeFormat', 'Symbol', 'upload', 'postMessage', 'loadAppSetting', 'saveAppSetting']);
const CODE_PROPERTIES = /^(keywords|tabs|key|id|path|className|class|type|value|table|event|schema|filter|color|stroke|fill|dataKey|icon|slug|role|table_name|bucket|contentType|font|fontFamily|cssText|href|tone|variant|spaceKey|featureKey|pattern|regex|field|column|col|idSelect|urlField)$/;

// Même normalisation que l'affichage (translate.js) : apostrophes, espaces insécables, « * », « : », « … ».
const normalizeKey = (key) => key.replace(/[\u2019\u02bc]/g, "'").replace(/[\u00a0\u202f]/g, ' ');
const baseKey = (key) => normalizeKey(key).replace(/(\s?\*|\s?:|…|\.\.\.)$/, '').trim();

const calleeName = (node) => node?.callee?.property?.name || node?.callee?.name;
// describeError(erreur, 'Composant', 'Message de repli') : le 3e argument s'affiche.
const isFallbackMessage = (call, node) => calleeName(call) === 'describeError' && call.arguments.indexOf(node) >= 2;

const collect = (file, entries) => {
  const code = readFileSync(path.join(root, file), 'utf8');
  const tree = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const add = (kind, key) => {
    const id = `${kind}\u0000${key}`;
    if (!entries.has(id)) entries.set(id, { kind, key, file });
  };
  traverse(tree, {
    'JSXElement|JSXFragment'(p) {
      const name = p.node.openingElement?.name?.name;
      if (name === 'style' || name === 'script') return;
      const slots = types.react.buildChildren(p.node).map((child) => {
        if (types.isStringLiteral(child)) return child.value;
        if (types.isTemplateLiteral(child) && !child.expressions.length) return child.quasis[0].value.cooked;
        return null;
      });
      const texts = slots.filter((slot) => slot !== null && LETTERS.test(slot));
      if (texts.length === 1) add('text', texts[0].trim());
      else if (texts.length > 1) add('mixed', slots.map((slot) => (slot === null ? '{}' : slot)).join('¦'));
    },
    StringLiteral(p) {
      const { node, parent } = p;
      if (types.isImportDeclaration(parent) || types.isExportDeclaration(parent) || types.isImport(parent.callee)) return;
      if (types.isObjectProperty(parent)) {
        if (parent.key === node) return;
        if (CODE_PROPERTIES.test(parent.key.name || parent.key.value || '')) return;
      }
      if (types.isMemberExpression(parent) || types.isDirective(parent)) return;
      if (types.isJSXAttribute(parent) && CODE_ATTRIBUTES.test(parent.name.name?.name || parent.name.name)) return;
      if (types.isJSXExpressionContainer(parent) && types.isJSXElement(p.parentPath.parent)) return;
      if (types.isCallExpression(parent) || types.isNewExpression(parent)) if (CODE_CALLS.has(calleeName(parent)) && parent.arguments.includes(node) && !isFallbackMessage(parent, node)) return;
      const attribute = p.findParent((x) => x.isJSXAttribute());
      if (attribute && CODE_ATTRIBUTES.test(attribute.node.name.name?.name || attribute.node.name.name)
        && !p.findParent((x) => x.isFunction() && x.findParent((y) => y === attribute))) return;
      const call = p.findParent((x) => x.isCallExpression());
      if (call && calleeName(call.node) === 'cn') return;
      if (isText(node.value)) add('text', node.value.trim());
    },
    TemplateLiteral(p) {
      const { quasis, expressions } = p.node;
      if (p.parentPath.isTaggedTemplateExpression()) return;
      const attribute = p.findParent((x) => x.isJSXAttribute());
      if (attribute && CODE_ATTRIBUTES.test(attribute.node.name.name?.name || attribute.node.name.name)
        && !p.findParent((x) => x.isFunction() && x.findParent((y) => y === attribute))) return;
      if (types.isCallExpression(p.parent) && CODE_CALLS.has(calleeName(p.parent)) && !isFallbackMessage(p.parent, p.node)) return;
      const pieces = quasis.map((quasi) => quasi.value.cooked);
      const joined = pieces.join(' ');
      if (!expressions.length) {
        if (joined.includes('<') && joined.includes('>')) return;
        if (!types.isJSXExpressionContainer(p.parent) && isText(joined)) add('text', joined.trim());
        return;
      }
      if (/<\w|[{};]\s*$|=>/m.test(joined)) {
        // Document HTML assemblé (fiche imprimée) : ses morceaux de texte.
        if (/<(td|th|p|h\d|span|div|strong)\b/.test(joined)) {
          joined.replace(/<style[\s\S]*?<\/style>/g, ' ').split(/<[^>]*>/).map((piece) => piece.trim())
            .filter((piece) => isText(piece) && piece.length < 200 && !/[{}]/.test(piece)).forEach((piece) => add('text', piece));
        }
        return;
      }
      if (!isText(joined.replace(/^[\s/#*.–-]+/, ''))) return;
      if (!/[A-Za-zÀ-ÿ]{3}/.test(joined)) return;
      // Identifiant assemblé (clé, chemin) plutôt que phrase.
      const whole = pieces.join('{}').trim();
      if (!ACCENT.test(joined) && !/[\s'’]/.test(whole)) { if (!/^[A-Z]/.test(whole)) return; }
      if (!ACCENT.test(joined) && /^[a-z0-9_\-:/ =&?.,%#|]+$/.test(joined) && !/\b(de|le|la|les|du|des|et|en|un|une|pour|par|sur|au|est|sont|ligne|agence|page|photo|jour|semaine|mois|an|terminal|aux|demande|lecteur|min|il|projection|groupe|cible)\b/.test(joined)) return;
      add('patterns', pieces.join('{}').trim());
    },
  });
};

const sources = () => {
  const list = [];
  const walk = (dir) => readdirSync(path.join(root, dir), { withFileTypes: true }).forEach((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (file !== 'src/i18n') walk(file); } else if (/\.jsx?$/.test(file)) list.push(file);
  });
  walk('src');
  return [...list, ...EXTRA_FILES];
};

export const extract = () => {
  const entries = new Map();
  sources().forEach((file) => collect(file, entries));
  return [...entries.values()];
};

export const readDictionary = () => JSON.parse(readFileSync(DICTIONARY, 'utf8'));

/** Textes absents du dictionnaire (et non déclarés dans ignored.json). */
export const findMissing = (entries = extract(), dictionary = readDictionary()) => {
  const ignored = new Set(JSON.parse(readFileSync(IGNORED, 'utf8')));
  return entries.filter((entry) => {
    const known = (key) => key in (dictionary[entry.kind] || {}) || ignored.has(key);
    return !known(entry.key) && !known(normalizeKey(entry.key)) && !(entry.kind === 'text' && known(baseKey(entry.key)));
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = extract();
  const json = process.argv.indexOf('--json');
  if (json > 0) {
    writeFileSync(process.argv[json + 1], JSON.stringify(entries, null, 1));
  } else if (process.argv.includes('--unused')) {
    const used = new Set(entries.flatMap((entry) => [entry.key, normalizeKey(entry.key), baseKey(entry.key)].map((key) => `${entry.kind}\u0000${key}`)));
    Object.entries(readDictionary()).forEach(([kind, values]) => Object.keys(values).forEach((key) => {
      if (!used.has(`${kind}\u0000${key}`)) console.log(`${kind}\t${key}`);
    }));
    console.log('\nÀ vérifier avant de retirer : certains textes sont assemblés ou viennent du serveur.');
  } else {
    const missing = findMissing(entries);
    missing.forEach((entry) => console.log(`${entry.file}\t${entry.kind}\t${entry.key.replace(/\n/g, '⏎')}`));
    console.log(`\n${missing.length} texte(s) sans traduction sur ${entries.length}.`);
  }
}
