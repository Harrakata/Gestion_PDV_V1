// ════════════════════════════════════════════════════════════════════════════
//  Visions de rapport — transformations côté client d'un résultat de rapport
//  ({ columns, rows } renvoyé par reportsService.runReport).
//
//  Générique : aucun rapport n'a à déclarer ses axes. Les champs sont déduits
//  des données :
//   - mesure    : colonne dont les valeurs non vides sont numériques ;
//   - date      : colonne au format AAAA-MM-JJ (→ axes Jour / Semaine / Mois) ;
//   - dimension : toute autre colonne (regroupement, valeurs distinctes).
//
//  Visions : 'detail' | 'synthese' | 'croise' | 'evolution'.
//  applyView() renvoie { columns, rows, chart? } directement exportable
//  (cf. exporters.js) : l'export reprend exactement la vision affichée.
// ════════════════════════════════════════════════════════════════════════════

import { format, parseISO, startOfWeek, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';

export const VIEW_TYPES = [
  { key: 'detail', label: 'Détail' },
  { key: 'synthese', label: 'Synthèse' },
  { key: 'croise', label: 'Tableau croisé' },
  { key: 'evolution', label: 'Évolution' },
];

export const GRANULARITIES = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

const AGG_LABELS = { sum: 'Somme', avg: 'Moyenne', min: 'Minimum', max: 'Maximum', distinct: 'Nb distinct' };
const EMPTY_LABEL = '(vide)';
const MAX_CROSS_COLUMNS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

const isEmpty = (v) => v == null || v === '';
const toNumber = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const fmtNumber = (v, digits = 0) =>
  Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '';

/** Déduit mesures / dates / dimensions à partir des colonnes et d'un échantillon. */
export const inferFields = (columns = [], rows = []) => {
  const sample = rows.slice(0, 300);
  const measures = [];
  const dates = [];
  const dimensions = [];
  columns.forEach((col) => {
    const values = sample.map((r) => r[col.key]).filter((v) => !isEmpty(v));
    if (!values.length) { dimensions.push(col); return; }
    const numeric = values.filter((v) => Number.isFinite(toNumber(v)) && !DATE_RE.test(String(v))).length;
    const dated = values.filter((v) => DATE_RE.test(String(v))).length;
    if (dated / values.length >= 0.8) dates.push(col);
    // Identifiants numériques (codes, matricules…) : on ne les somme pas.
    else if (numeric / values.length >= 0.8 && !/code|matricule|ticket|ref|id$/i.test(col.key)) measures.push(col);
    else dimensions.push(col);
  });
  return { measures, dates, dimensions };
};

/** Axes de regroupement proposés : dimensions + dates (jour / semaine / mois). */
export const buildAxes = (fields) => [
  ...fields.dimensions.map((c) => ({ key: c.key, label: c.label })),
  ...fields.dates.flatMap((c) => GRANULARITIES.map((g) => ({
    key: `${c.key}@${g.key}`,
    label: `${c.label} (${g.label.toLowerCase()})`,
  }))),
];

/** Mesures proposées : nombre de lignes, agrégats numériques, valeurs distinctes. */
export const buildMeasures = (fields) => [
  { key: 'count', label: 'Nombre de lignes' },
  ...fields.measures.flatMap((c) => ['sum', 'avg', 'min', 'max'].map((agg) => ({
    key: `${agg}:${c.key}`,
    label: `${AGG_LABELS[agg]} — ${c.label}`,
  }))),
  ...[...fields.dimensions, ...fields.dates].map((c) => ({
    key: `distinct:${c.key}`,
    label: `${AGG_LABELS.distinct} — ${c.label}`,
  })),
];

const periodKey = (raw, granularity) => {
  const d = parseISO(String(raw).slice(0, 10));
  if (!isValid(d)) return EMPTY_LABEL;
  if (granularity === 'month') return format(d, 'yyyy-MM');
  if (granularity === 'week') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return format(d, 'yyyy-MM-dd');
};

const periodLabel = (key, granularity) => {
  if (key === EMPTY_LABEL) return key;
  const d = parseISO(granularity === 'month' ? `${key}-01` : key);
  if (!isValid(d)) return key;
  if (granularity === 'month') return format(d, 'MMMM yyyy', { locale: fr });
  if (granularity === 'week') return `Sem. du ${format(d, 'dd/MM/yyyy')}`;
  return format(d, 'dd/MM/yyyy');
};

/** Valeur d'axe d'une ligne : { sortKey, label }. */
const axisValue = (row, axisKey, columnsByKey) => {
  const [field, granularity] = axisKey.split('@');
  const raw = row[field];
  if (isEmpty(raw)) return { sortKey: '~', label: EMPTY_LABEL };
  if (granularity) {
    const key = periodKey(raw, granularity);
    return { sortKey: key, label: periodLabel(key, granularity) };
  }
  const col = columnsByKey.get(field);
  const label = typeof col?.format === 'function' ? String(col.format(raw, row) ?? raw) : String(raw);
  return { sortKey: label.toLocaleLowerCase('fr'), label };
};

/** Calcule une mesure sur un sous-ensemble de lignes (valeur numérique brute). */
const computeMeasure = (rows, measureKey) => {
  if (measureKey === 'count') return rows.length;
  const [agg, field] = measureKey.split(':');
  if (agg === 'distinct') return new Set(rows.map((r) => r[field]).filter((v) => !isEmpty(v))).size;
  const nums = rows.map((r) => toNumber(r[field])).filter(Number.isFinite);
  if (!nums.length) return null;
  if (agg === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (agg === 'min') return Math.min(...nums);
  if (agg === 'max') return Math.max(...nums);
  return null;
};

const measureFormatter = (measureKey) => {
  const agg = measureKey.split(':')[0];
  return (v) => (v == null ? '' : fmtNumber(v, agg === 'avg' ? 2 : 0));
};

const groupRows = (rows, axisKey, columnsByKey) => {
  const groups = new Map();
  rows.forEach((row) => {
    const { sortKey, label } = axisValue(row, axisKey, columnsByKey);
    if (!groups.has(sortKey)) groups.set(sortKey, { sortKey, label, rows: [] });
    groups.get(sortKey).rows.push(row);
  });
  return [...groups.values()];
};

const labelOf = (list, key) => list.find((x) => x.key === key)?.label || key;

// ── Visions ───────────────────────────────────────────────────────────────────

const detailView = (result, view) => {
  const hidden = new Set(view.hiddenColumns || []);
  const columns = result.columns.filter((c) => !hidden.has(c.key));
  let rows = result.rows;
  const q = (view.search || '').trim().toLocaleLowerCase('fr');
  if (q) {
    rows = rows.filter((row) => result.columns.some((c) => {
      const v = typeof c.format === 'function' ? c.format(row[c.key], row) : row[c.key];
      return !isEmpty(v) && String(v).toLocaleLowerCase('fr').includes(q);
    }));
  }
  if (view.sortKey) {
    const dir = view.sortDir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const va = a[view.sortKey]; const vb = b[view.sortKey];
      const na = toNumber(va); const nb = toNumber(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'fr', { numeric: true }) * dir;
    });
  }
  return { columns, rows };
};

const syntheseView = (result, view, ctx) => {
  const axes = (view.groupBy || []).filter(Boolean);
  const measure = view.measure || 'count';
  const fmt = measureFormatter(measure);
  const showShare = measure === 'count' || measure.startsWith('sum:');
  const total = computeMeasure(result.rows, measure);

  const columns = [
    ...axes.map((a, i) => ({ key: `g${i}`, label: labelOf(ctx.axes, a) })),
    { key: 'm', label: labelOf(ctx.measures, measure), format: fmt },
    ...(showShare ? [{ key: 'part', label: 'Part (%)', format: (v) => (v == null ? '' : `${fmtNumber(v, 1)} %`) }] : []),
  ];

  const rows = [];
  const walk = (subset, depth, prefix) => {
    if (depth === axes.length) {
      const m = computeMeasure(subset, measure);
      rows.push({ ...prefix, m, part: showShare && total ? (m / total) * 100 : null });
      return;
    }
    groupRows(subset, axes[depth], ctx.columnsByKey)
      .sort((a, b) => computeMeasure(b.rows, measure) - computeMeasure(a.rows, measure) || a.sortKey.localeCompare(b.sortKey))
      .forEach((g) => walk(g.rows, depth + 1, { ...prefix, [`g${depth}`]: g.label }));
  };
  if (axes.length) walk(result.rows, 0, {});
  rows.push({ g0: 'Total', m: total, part: showShare ? 100 : null, _total: true });
  return { columns, rows };
};

const croiseView = (result, view, ctx) => {
  const measure = view.measure || 'count';
  const fmt = measureFormatter(measure);
  if (!view.rowAxis || !view.colAxis) return { columns: [], rows: [] };
  const colGroups = groupRows(result.rows, view.colAxis, ctx.columnsByKey)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr', { numeric: true }))
    .slice(0, MAX_CROSS_COLUMNS);
  const columns = [
    { key: 'r', label: labelOf(ctx.axes, view.rowAxis) },
    ...colGroups.map((g, i) => ({ key: `c${i}`, label: g.label, format: fmt })),
    { key: 'total', label: 'Total', format: fmt },
  ];
  const cell = (rows, i) => {
    const g = colGroups[i];
    const subset = rows.filter((r) => axisValue(r, view.colAxis, ctx.columnsByKey).sortKey === g.sortKey);
    return subset.length ? computeMeasure(subset, measure) : null;
  };
  const rows = groupRows(result.rows, view.rowAxis, ctx.columnsByKey)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr', { numeric: true }))
    .map((g) => {
      const out = { r: g.label, total: computeMeasure(g.rows, measure) };
      colGroups.forEach((_, i) => { out[`c${i}`] = cell(g.rows, i); });
      return out;
    });
  const totalRow = { r: 'Total', total: computeMeasure(result.rows, measure), _total: true };
  colGroups.forEach((g, i) => { totalRow[`c${i}`] = computeMeasure(g.rows, measure); });
  rows.push(totalRow);
  return { columns, rows, truncatedColumns: groupRows(result.rows, view.colAxis, ctx.columnsByKey).length > MAX_CROSS_COLUMNS };
};

const evolutionView = (result, view, ctx) => {
  const measure = view.measure || 'count';
  const fmt = measureFormatter(measure);
  if (!view.dateField) return { columns: [], rows: [], chart: [] };
  const axis = `${view.dateField}@${view.granularity || 'day'}`;
  const groups = groupRows(result.rows, axis, ctx.columnsByKey)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const rows = groups.map((g) => ({ p: g.label, m: computeMeasure(g.rows, measure) }));
  const columns = [
    { key: 'p', label: GRANULARITIES.find((g) => g.key === (view.granularity || 'day'))?.label || 'Période' },
    { key: 'm', label: labelOf(ctx.measures, measure), format: fmt },
  ];
  const chart = rows.map((r) => ({ name: r.p, value: Number(r.m) || 0 }));
  rows.push({ p: 'Total', m: computeMeasure(result.rows, measure), _total: true });
  return { columns, rows, chart };
};

/** Contexte (champs, axes, mesures) d'un résultat — à mémoïser côté écran. */
export const buildViewContext = (result) => {
  const columns = result?.columns || [];
  const fields = inferFields(columns, result?.rows || []);
  return {
    fields,
    axes: buildAxes(fields),
    measures: buildMeasures(fields),
    columnsByKey: new Map(columns.map((c) => [c.key, c])),
  };
};

/** Configuration par défaut cohérente avec les champs du rapport. */
export const defaultViewFor = (ctx, previous = {}) => {
  const axisKeys = new Set(ctx.axes.map((a) => a.key));
  const measureKeys = new Set(ctx.measures.map((m) => m.key));
  const preferredAxis = ['agence', 'agence_nom', 'statut', 'type'].find((k) => axisKeys.has(k)) || ctx.axes[0]?.key || '';
  const firstDate = ctx.fields.dates[0]?.key || '';
  const keep = (key, set, fallback) => (key && set.has(key) ? key : fallback);
  // L'évolution exige une date : sinon on revient au détail.
  const type = previous.type === 'evolution' && !firstDate ? 'detail' : (previous.type || 'detail');
  return {
    type,
    hiddenColumns: (previous.hiddenColumns || []).filter((k) => ctx.columnsByKey.has(k)),
    search: '',
    sortKey: previous.sortKey && ctx.columnsByKey.has(previous.sortKey) ? previous.sortKey : '',
    sortDir: previous.sortDir || 'asc',
    groupBy: [
      keep(previous.groupBy?.[0], axisKeys, preferredAxis),
      keep(previous.groupBy?.[1], axisKeys, ''),
    ],
    measure: keep(previous.measure, measureKeys, ctx.fields.measures[0] ? `sum:${ctx.fields.measures[0].key}` : 'count'),
    rowAxis: keep(previous.rowAxis, axisKeys, preferredAxis),
    // Croisé par défaut : <axe préféré> × mois (si le rapport est daté).
    colAxis: keep(
      previous.colAxis,
      axisKeys,
      (firstDate && `${firstDate}@month`) || ctx.axes.find((a) => a.key !== preferredAxis && !a.key.includes('@'))?.key || ''
    ),
    dateField: ctx.fields.dates.some((d) => d.key === previous.dateField) ? previous.dateField : firstDate,
    granularity: previous.granularity || 'day',
  };
};

/** Applique la vision → { columns, rows, chart?, truncatedColumns? }. */
export const applyView = (result, view, ctx) => {
  if (!result) return { columns: [], rows: [] };
  switch (view?.type) {
    case 'synthese': return syntheseView(result, view, ctx);
    case 'croise': return croiseView(result, view, ctx);
    case 'evolution': return evolutionView(result, view, ctx);
    default: return detailView(result, view || {});
  }
};

/** Libellé court de la vision, pour les titres d'export. */
export const describeView = (view, ctx) => {
  switch (view?.type) {
    case 'synthese': {
      const axes = (view.groupBy || []).filter(Boolean).map((a) => labelOf(ctx.axes, a));
      return `Synthèse${axes.length ? ` par ${axes.join(' puis ')}` : ''} — ${labelOf(ctx.measures, view.measure)}`;
    }
    case 'croise':
      return `Tableau croisé ${labelOf(ctx.axes, view.rowAxis)} × ${labelOf(ctx.axes, view.colAxis)} — ${labelOf(ctx.measures, view.measure)}`;
    case 'evolution':
      return `Évolution par ${(GRANULARITIES.find((g) => g.key === view.granularity)?.label || 'jour').toLowerCase()} — ${labelOf(ctx.measures, view.measure)}`;
    default:
      return 'Détail';
  }
};
