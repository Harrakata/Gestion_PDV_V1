import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMobiEnjeuxRows, buildMobiProfitabilityCurve, groupMobiEnjeuxRows,
  expandMobiDailySeries, groupMobiTrendSeries, mergeMobiContributionSeries, mobiEnjeuxFixedChargeEntries, mobiEnjeuxInvestmentEntries,
  mobiFilterOptions, mergeMobiSeriesPages,
  summarizeMobiEnjeuxRows } from '../../src/lib/mobiEnjeux.js';

const deployments = [
  { reference: 'M1', pointVente: 'PDV-1', agence: 'Agence A', region: 'Nord', secteur: 'S1', guichetiere: 'Awa' },
  { reference: 'M2', pointVente: 'PDV-1', agence: 'Agence A', region: 'Nord', secteur: 'S1', guichetiere: 'Awa' },
  { reference: 'M3', pointVente: '', agence: '', region: '', secteur: '', guichetiere: '' },
];

const summaries = [
  { reference: 'M1', periodStakes: 100, cumulativeStakes: 1000, reportedDays: 2, latestDate: '2026-10-18' },
  { reference: 'M2', periodStakes: 50, cumulativeStakes: 500, reportedDays: 1, latestDate: '2026-10-19' },
];

const allocateConfig = (_config, terminal) => ({
  tauxContribution: terminal.reference === 'M2' ? 20 : 10,
  investissements: [{ montant: terminal.reference === 'M1' ? 80 : 20, date: '2026-01-01' }],
});

test('conserve tout le référentiel, y compris les Mobi sans remontée', () => {
  const rows = buildMobiEnjeuxRows({ deployments, summaries, config: {},
    references: deployments.map((row) => row.reference), dateTo: '2026-10-20', allocateConfig });
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.reference === 'M3').hasReport, false);
  assert.equal(rows.find((row) => row.reference === 'M3').periodStakes, 0);
  assert.deepEqual(summarizeMobiEnjeuxRows(rows), {
    terminalCount: 3, reportedTerminals: 2, periodStakes: 150, cumulativeStakes: 1500,
    periodContribution: 20, periodCharges: 0, periodNetContribution: 20,
    cumulativeContribution: 20, investment: 120, grossBalance: -100,
  });
});

test('regroupe les enjeux selon les dimensions du référentiel Point de vente Mobi', () => {
  const rows = buildMobiEnjeuxRows({ deployments, summaries });
  const groups = groupMobiEnjeuxRows(rows, 'pointVente');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], {
    key: 'PDV-1', label: 'PDV-1', terminalCount: 2, reportedTerminals: 2,
    periodStakes: 150, cumulativeStakes: 1500, periodContribution: 0,
    periodCharges: 0, periodNetContribution: 0, cumulativeContribution: 0,
    investment: 0, grossBalance: 0, lastDate: '2026-10-19',
  });
  assert.equal(groups[1].label, 'Point de vente non affecté');
  assert.equal(groups[1].terminalCount, 1);
});

test('ne double-compte pas un cumul lorsqu’il agrège la période', () => {
  const rows = buildMobiEnjeuxRows({ deployments: deployments.slice(0, 1), summaries: [{
    reference: 'M1', periodStakes: 25, cumulativeStakes: 500, reportedDays: 10,
  }] });
  const totals = summarizeMobiEnjeuxRows(rows);
  assert.equal(totals.periodStakes, 25);
  assert.equal(totals.cumulativeStakes, 500);
});

test('recompose exactement la contribution lorsque les taux diffèrent', () => {
  const rows = mergeMobiContributionSeries([
    { rate: 10, series: [{ period: '2026-01-01', periodStakes: 100,
      cumulativeStakes: 1000, terminalCount: 1, dayCount: 31 }] },
    { rate: 20, series: [{ period: '2026-01-01', periodStakes: 50,
      cumulativeStakes: 500, terminalCount: 1, dayCount: 30 }] },
  ]);
  assert.deepEqual(rows, [{ period: '2026-01-01', periodStakes: 150,
    cumulativeStakes: 1500, periodContribution: 20, cumulativeContribution: 20,
    periodVariableCharges: 0, terminalCount: 2, dayCount: 31 }]);
});

test('reporte le cumul des lots et profils sans remontée dans une période ultérieure', () => {
  const pages = mergeMobiSeriesPages([
    [{ period: '2026-01-01', periodStakes: 10, cumulativeStakes: 100, terminalCount: 1, dayCount: 1 }],
    [{ period: '2026-01-01', periodStakes: 20, cumulativeStakes: 200, terminalCount: 1, dayCount: 1 },
      { period: '2026-02-01', periodStakes: 5, cumulativeStakes: 205, terminalCount: 1, dayCount: 1 }],
  ]);
  assert.deepEqual(pages.map((row) => [row.period, row.periodStakes, row.cumulativeStakes]), [
    ['2026-01-01', 30, 300], ['2026-02-01', 5, 305],
  ]);
  const merged = mergeMobiContributionSeries([
    { rate: 10, series: [{ period: '2026-01-01', periodStakes: 10,
      cumulativeStakes: 100, terminalCount: 1, dayCount: 1 }] },
    { rate: 20, series: [{ period: '2026-01-01', periodStakes: 20,
      cumulativeStakes: 200, terminalCount: 1, dayCount: 1 }, { period: '2026-02-01',
      periodStakes: 5, cumulativeStakes: 205, terminalCount: 1, dayCount: 1 }] },
  ]);
  assert.equal(merged[1].cumulativeContribution, 6);
});

test('complète la courbe quotidienne sans inventer d’enjeu entre deux remontées', () => {
  const rows = expandMobiDailySeries([
    { period: '2026-01-01', periodStakes: 10, cumulativeStakes: 100,
      terminalCount: 1, dayCount: 1 },
    { period: '2026-01-03', periodStakes: 25, cumulativeStakes: 125,
      terminalCount: 1, dayCount: 1 },
  ], '2026-01-01', '2026-01-04');
  assert.deepEqual(rows.map((row) => [row.period, row.periodStakes, row.cumulativeStakes]), [
    ['2026-01-01', 10, 100],
    ['2026-01-02', 0, 100],
    ['2026-01-03', 25, 125],
    ['2026-01-04', 0, 125],
  ]);
});

test('regroupe la courbe de contrôle selon la granularité sélectionnée', () => {
  const daily = [
    { period: '2026-01-30', periodStakes: 10, cumulativeStakes: 100, terminalCount: 2, dayCount: 1 },
    { period: '2026-01-31', periodStakes: 20, cumulativeStakes: 120, terminalCount: 3, dayCount: 1 },
    { period: '2026-02-01', periodStakes: 30, cumulativeStakes: 150, terminalCount: 2, dayCount: 1 },
  ];
  assert.deepEqual(groupMobiTrendSeries(daily, 'mois'), [
    { period: '2026-01-01', periodStakes: 30, cumulativeStakes: 120, terminalCount: 3, dayCount: 2 },
    { period: '2026-02-01', periodStakes: 30, cumulativeStakes: 150, terminalCount: 2, dayCount: 1 },
  ]);
  assert.deepEqual(groupMobiTrendSeries(daily, 'annee'), [
    { period: '2026-01-01', periodStakes: 60, cumulativeStakes: 150, terminalCount: 3, dayCount: 3 },
  ]);
});

test('trace le capital, le solde réel et le franchissement du seuil zéro', () => {
  const result = buildMobiProfitabilityCurve({ granularity: 'mois', series: [
    { period: '2026-01-01', periodContribution: 30, cumulativeContribution: 30 },
    { period: '2026-02-01', periodContribution: 40, cumulativeContribution: 70 },
    { period: '2026-03-01', periodContribution: 50, cumulativeContribution: 120 },
  ], investments: [{ date: '2026-01-10', amount: 100 }] });
  assert.deepEqual(result.rows.slice(0, 3).map((row) => [row.investment, row.balance]),
    [[100, -70], [100, -30], [100, 20]]);
  assert.equal(result.actualPaybackDate, '2026-03-31');
  assert.equal(result.recoveryPercent, 120);
  assert.equal(result.projectedPaybackDate, '');
});

test('projette le solde sans présenter la projection comme du réalisé', () => {
  const result = buildMobiProfitabilityCurve({ granularity: 'mois', averageWindow: 2,
    projectionPeriods: 12, series: [
      { period: '2026-01-01', periodContribution: 20, cumulativeContribution: 20 },
      { period: '2026-02-01', periodContribution: 30, cumulativeContribution: 50 },
    ], investments: [{ date: '2026-01-01', amount: 100 }] });
  assert.equal(result.averageContribution, 25);
  assert.equal(result.rows[1].balance, -50);
  assert.equal(result.rows[1].projectionBalance, -50);
  assert.equal(result.rows[2].projected, true);
  assert.equal(result.rows[2].balance, null);
  assert.equal(result.projectedPaybackDate, '2026-04-30');
});

test('répartit les investissements du périmètre sans dupliquer le capital global', () => {
  const entries = mobiEnjeuxInvestmentEntries({ config: {}, deployments: deployments.slice(0, 2),
    references: deployments.map((row) => row.reference), allocateConfig });
  assert.deepEqual(entries.map((entry) => [entry.reference, entry.amount]), [['M1', 80], ['M2', 20]]);
});

test('les options de filtre dépendent uniquement des filtres placés en amont', () => {
  const rows = [
    { reference: 'M1', region: 'Nord', secteur: 'S1', agence: 'A1' },
    { reference: 'M2', region: 'Sud', secteur: 'S2', agence: 'A2' },
  ];
  const filters = { region: '__all__', secteur: 'S1', agence: 'A1', pointVente: '__all__',
    guichetiere: '__all__', terminal: '__all__' };
  assert.deepEqual(mobiFilterOptions(rows, filters, 'region'), ['Nord', 'Sud']);
  assert.deepEqual(mobiFilterOptions(rows, { ...filters, region: 'Sud' }, 'secteur'), ['S2']);
});

test('applique une redevance uniquement aux enjeux produits dans chaque période', () => {
  const merged = mergeMobiContributionSeries([{
    rate: 20,
    variableCharges: [{ typeMontant: 'pourcentage_ca', montant: 10, ponderation: 100,
      dateDebut: '2026-02-01', dateFin: '' }],
    series: [
      { period: '2026-01-01', periodStakes: 100, cumulativeStakes: 100, terminalCount: 1, dayCount: 31 },
      { period: '2026-02-01', periodStakes: 100, cumulativeStakes: 200, terminalCount: 1, dayCount: 28 },
    ],
  }], { granularity: 'mois', dateFrom: '2026-01-01', dateTo: '2026-02-28' });
  assert.deepEqual(merged.map((row) => Math.round(row.periodVariableCharges)), [0, 2]);
  const result = buildMobiProfitabilityCurve({ series: merged, granularity: 'mois',
    calculationFrom: '2026-01-01', dateTo: '2026-02-28',
    fixedCharges: [{ montant: 31, ponderation: 100, frequence: 'mensuelle',
      dateDebut: '2026-01-01', dateFin: '' }],
    investments: [{ date: '2026-01-01', amount: 100 }] });
  assert.equal(Math.round(result.rows[0].periodCharges), 31);
  assert.equal(Math.round(result.rows[1].periodCharges), 33);
  assert.equal(Math.round(result.cumulativeCharges), 64);
  assert.equal(Math.round(result.currentNetContribution), -24);
  assert.equal(Math.round(result.currentBalance), -124);
});

test('calcule la redevance sur la contribution brute et non directement sur ENJEUX_JOUR', () => {
  const [row] = mergeMobiContributionSeries([{
    rate: 5,
    variableCharges: [{ typeMontant: 'pourcentage_ca', montant: 6, ponderation: 100,
      dateDebut: '2025-01-01', dateFin: '' }],
    series: [{ period: '2026-10-02', periodStakes: 22030750,
      cumulativeStakes: 22030750, terminalCount: 1078, dayCount: 1 }],
  }], { granularity: 'jour', dateFrom: '2026-10-02', dateTo: '2026-10-02' });
  assert.equal(row.periodContribution, 1101537.5);
  assert.equal(row.periodVariableCharges, 66092.25);
  assert.equal(row.periodContribution - row.periodVariableCharges, 1035445.25);
});

test('ne facture pas une redevance sans nouveaux enjeux dans la période', () => {
  const merged = mergeMobiContributionSeries([{
    rate: 5,
    variableCharges: [{ typeMontant: 'pourcentage_ca', montant: 10, ponderation: 100,
      dateDebut: '2026-01-01', dateFin: '' }],
    series: [
      { period: '2025-12-01', periodStakes: 100, cumulativeStakes: 1000, terminalCount: 1, dayCount: 31 },
      { period: '2026-01-01', periodStakes: 0, cumulativeStakes: 1000, terminalCount: 1, dayCount: 31 },
      { period: '2026-02-01', periodStakes: 0, cumulativeStakes: 1000, terminalCount: 1, dayCount: 28 },
    ],
  }], { granularity: 'mois', dateFrom: '2025-12-01', dateTo: '2026-02-28' });
  assert.deepEqual(merged.map((row) => Math.round(row.periodVariableCharges)), [0, 0, 0]);
  const result = buildMobiProfitabilityCurve({ series: merged, granularity: 'mois',
    calculationFrom: '2025-12-01', dateTo: '2026-02-28' });
  assert.deepEqual(result.rows.map((row) => Math.round(row.cumulativeCharges)), [0, 0, 0]);
});

test('construit le cumul de récupération depuis les flux de période et non CUMUL_ENJEUX', () => {
  const merged = mergeMobiContributionSeries([{ rate: 10, series: [
    { period: '2026-01-01', periodStakes: 100, cumulativeStakes: 10000, terminalCount: 1, dayCount: 31 },
    { period: '2026-02-01', periodStakes: 50, cumulativeStakes: 50000, terminalCount: 1, dayCount: 28 },
  ] }], { granularity: 'mois', dateFrom: '2026-01-01', dateTo: '2026-02-28' });
  assert.deepEqual(merged.map((row) => row.cumulativeContribution), [10, 15]);
  const result = buildMobiProfitabilityCurve({ series: merged, granularity: 'mois',
    calculationFrom: '2026-01-01', dateTo: '2026-02-28' });
  assert.deepEqual(result.rows.map((row) => row.cumulativeNetContribution), [10, 15]);
});

test('répartit les charges fixes du périmètre sans dupliquer le montant du parc', () => {
  const allocateCharges = (_config, terminal) => ({ charges: [{ id: 'c1', typeMontant: 'fixe',
    montant: terminal.reference === 'M1' ? 75 : 25, ponderation: 100, frequence: 'mensuelle',
    dateDebut: '2026-01-01' }] });
  const entries = mobiEnjeuxFixedChargeEntries({ config: {}, deployments: deployments.slice(0, 2),
    references: deployments.map((row) => row.reference), allocateConfig: allocateCharges });
  assert.deepEqual(entries.map((entry) => [entry.reference, entry.montant]), [['M1', 75], ['M2', 25]]);
});
