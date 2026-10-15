import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateMobiConfig, buildMobiDaily, calculateMobiSummary, chargeForDay, chunkMobiValues, createMobiAttributionContext, enrichMobiDaily, groupMobiDaily, mobiAmortizationSeries, mobiChartSeries, mobiDayDetails, mobiDeploymentRows, mobiEconomicSeries, mobiFullProfitability, mobiObservedProjection,
  mobiAllocationShare, mobiDatesFromSuivi, mobiGapSeries, mobiInvestmentAmortizationForDay, mobiMaxVariableChargeRate, mobiParkRows, mobiRentabilityTargetForDay, mobiWeightsFromHistory, normalizeMobiConfig, normalizeMobiGlobalConfig } from '../src/lib/mobiRentabilite.js';

test('découpe le suivi de 2 386 Mobi sans dépasser 80 références par requête', () => {
  const references = Array.from({ length: 2386 }, (_, index) => `MOBI-${index}`);
  const chunks = chunkMobiValues(references);
  assert.equal(chunks.length, 30);
  assert.ok(chunks.every((chunk) => chunk.length <= 80));
  assert.deepEqual(chunks.flat(), references);
});

test('l’index partagé conserve les attributions lors d’un changement de Mobi', () => {
  const points = [
    { terminalReference: 'M1', guichetiereMatricule: '1', dateDebutValidite: '2026-01-01', dateFinValidite: '2026-01-02' },
    { terminalReference: 'M2', guichetiereMatricule: '1', dateDebutValidite: '2026-01-03' },
  ];
  const guichetieres = [{ matricule: '1', codePrepose: 'P1' }];
  const ccopeRows = [
    { operateur: 'P1', date_op: '2026-01-02', mt_enr: 20 },
    { operateur: 'P1', date_op: '2026-01-03', mt_enr: 30 },
  ];
  const versements = [{ guichetiere_code: 'P1', date_versement: '2026-01-03', montant: 25 }];
  const context = createMobiAttributionContext(points, guichetieres);
  for (const terminalReference of ['M1', 'M2']) {
    const args = { points, guichetieres, terminalReference, serviceDate: '2026-01-01', endDate: '2026-01-03', ccopeRows, versements };
    assert.deepEqual(buildMobiDaily({ ...args, context }), buildMobiDaily(args));
  }
  assert.equal(buildMobiDaily({ points, guichetieres, terminalReference: 'M2', serviceDate: '2026-01-01', endDate: '2026-01-03', ccopeRows, versements, context }).daily[2].mtVerse, 25);
});

test('filtre la plage du graphe avant de regrouper les montants et écarts', () => {
  const daily = [
    { day: '2026-09-30', caNet: 100, mtVerse: 70, objectifCaNet: 100, objectifVerse: 80, charges: 0, caKnown: true, verseKnown: true },
    { day: '2026-10-01', caNet: 50, mtVerse: 30, objectifCaNet: 50, objectifVerse: 40, charges: 0, caKnown: true, verseKnown: true },
    { day: '2026-10-02', caNet: 80, mtVerse: 60, objectifCaNet: 80, objectifVerse: 50, charges: 0, caKnown: true, verseKnown: true },
  ];
  const chart = mobiChartSeries(daily, 'mois', '2026-10-01', '2026-10-01');
  assert.equal(chart.length, 1);
  assert.equal(chart[0].period, '2026-10');
  assert.equal(chart[0].caNet, 50);
  assert.equal(chart[0].objectifCaNetTrace, 50);
  assert.equal(chart[0].objectifVerseTrace, 40);
  assert.equal(chart[0].ecartCaVerse, 20);
  assert.equal(chart[0].ecartVerseSurplus, 0);
  assert.equal(chart[0].ecartVerseManque, 10);
  assert.equal(mobiChartSeries(daily, 'jour', '2026-10-03', '2026-10-04').length, 0);
});

test('cumule les investissements et la contribution avant la période affichée', () => {
  const entries = [{ serviceDate: '2026-01-01', config: {
    tauxContribution: 50,
    investissements: [{ date: '2026-01-01', montant: 100 }, { date: '2026-01-02', montant: 50 }],
  }, daily: [
    { day: '2026-01-01', caNet: 50, charges: 5 },
    { day: '2026-01-02', caNet: 100, charges: 0 },
  ] }];
  const full = mobiAmortizationSeries(entries, 'jour', '', '', '2026-01-02');
  assert.deepEqual(full.map(({ investment, contribution, remaining }) => [investment, contribution, remaining]),
    [[100, 20, 80], [150, 70, 80]]);
  const filtered = mobiAmortizationSeries(entries, 'mois', '2026-01-02', '2026-01-02', '2026-01-02');
  assert.deepEqual(filtered, [{ period: '2026-01', investment: 150, contribution: 70, remaining: 80 }]);
});

test('relie chaque Mobi à son affectation active et au secteur de son agence', () => {
  const rows = mobiDeploymentRows(
    [{ reference: 'MOB01', modele: 'P390', statut: 'Actif' }, { reference: 'MOB02', statut: 'Inactif' }],
    [
      { terminalReference: 'MOB01', statut: 'Inactif', dateDebutValidite: '2026-01-01', guichetiereNom: 'Ancienne' },
      { terminalReference: 'MOB01', statut: 'Actif', dateDebutValidite: '2026-02-01', agenceCodePDV: '1102', guichetiereNom: 'Sarah', guichetiereMatricule: '1912' },
    ],
    [{ codePDV: '1102', nom: 'PCD du Fleuve', region: 'Kinshasa', secteur: 'Centre' }],
  );
  assert.deepEqual(rows[0], { reference: 'MOB01', modele: 'P390', statut: 'Actif', region: 'Kinshasa', secteur: 'Centre', agence: 'PCD du Fleuve', guichetiere: 'Sarah', matricule: '1912' });
  assert.equal(rows[1].agence, '');
});

test('trie la synthèse du parc et distingue objectif absent et versement indisponible', () => {
  const terminals = ['B', 'A', 'D', 'C'].map((reference) => ({ reference, statut: 'Actif' }));
  const entries = {
    A: { grouped: [{ mtVerse: 80, objectifVerse: 100, verseKnownDays: 30 }], summary: { investment: 1000, caNet: 200, charges: 20, remaining: 800 } },
    B: { grouped: [{ mtVerse: 90, objectifVerse: 0, objectifCaNet: 120, verseKnownDays: 30 }], summary: { investment: 500, caNet: 300, charges: 10, remaining: 200 } },
    C: { grouped: [{ mtVerse: 0, objectifVerse: 100, verseKnownDays: 0 }], summary: { investment: 200, caNet: 0, charges: 0, remaining: 200 } },
    D: { grouped: [{ mtVerse: 50, objectifVerse: 0, verseKnownDays: 30 }], summary: { investment: 100, caNet: 100, charges: 0, remaining: 100 } },
  };
  assert.deepEqual(mobiParkRows(terminals, entries).map((row) => row.reference), ['A', 'B', 'C', 'D']);
  assert.deepEqual(mobiParkRows(terminals, entries, 'gap').map((row) => row.reference), ['B', 'A', 'C', 'D']);
  assert.deepEqual(mobiParkRows(terminals, entries, 'remaining').map((row) => row.reference), ['A', 'B', 'C', 'D']);
  assert.equal(mobiParkRows(terminals, entries)[1].objectiveMetric, 'CA net');
  assert.equal(mobiParkRows(terminals, entries)[2].gap, null);
  assert.equal(mobiParkRows(terminals, entries)[2].verseKnown, false);
  assert.equal(mobiParkRows(terminals, entries)[3].objective, 0);
});

test('calcule les écarts du graphe sans inventer des données hors couverture', () => {
  const [complete, partial, surplus, caTargetFallback, noTarget] = mobiGapSeries([
    { period: '2026-08', caNet: 120, mtVerse: 90, objectifVerse: 100, caKnownDays: 31, verseKnownDays: 31 },
    { period: '2026-09', caNet: 80, mtVerse: 60, objectifVerse: 100, caKnownDays: 15, verseKnownDays: 30 },
    { period: '2026-10', caNet: 130, mtVerse: 120, objectifVerse: 100, caKnownDays: 31, verseKnownDays: 31 },
    { period: '2026-11', caNet: 130, mtVerse: 60, objectifCaNet: 100, objectifVerse: 0, caKnownDays: 30, verseKnownDays: 30 },
    { period: '2026-12', caNet: 50, mtVerse: 40, objectifVerse: 0, caKnownDays: 14, verseKnownDays: 14 },
  ]);
  assert.equal(complete.ecartCaVerse, 30);
  assert.equal(complete.ecartVerseSurplus, 0);
  assert.equal(complete.ecartVerseManque, 10);
  assert.equal(complete.objectifVerseTrace, 100);
  assert.equal(partial.ecartCaVerse, null);
  assert.equal(partial.ecartVerseManque, 40);
  assert.equal(surplus.ecartVerseSurplus, 20);
  assert.equal(surplus.ecartVerseManque, 0);
  assert.equal(caTargetFallback.objectifComparaisonVerse, 100);
  assert.equal(caTargetFallback.comparaisonSurCaNet, true);
  assert.equal(caTargetFallback.ecartVerseManque, 40);
  assert.equal(noTarget.ecartVerseSurplus, null);
  assert.equal(noTarget.ecartVerseManque, null);
  assert.equal(noTarget.objectifVerseTrace, null);
});

test('déduit automatiquement les dates du suivi selon le statut du Mobi', () => {
  const suivi = { premiere_utilisation: '2025-04-25T08:00:00Z', derniere_utilisation: '2026-10-10T18:00:00Z' };
  assert.deepEqual(mobiDatesFromSuivi({ statut: 'Inactif' }, suivi, '2026-10-14'),
    { dateMiseEnService: '2025-04-25', dateDebutInactivite: '2026-10-11' });
  assert.deepEqual(mobiDatesFromSuivi({ statut: 'Actif' }, suivi, '2026-10-14'),
    { dateMiseEnService: '2025-04-25', dateDebutInactivite: '' });
  assert.deepEqual(mobiDatesFromSuivi({ statut: 'Inactif' }, {}, '2026-10-14'),
    { dateMiseEnService: '', dateDebutInactivite: '' });
  const config = { investissements: [], objectifs: [], charges: [], terminalRules: {
    M1: { dateMiseEnService: '2024-01-01', dateDebutInactivite: '2026-01-01' },
  } };
  const effective = allocateMobiConfig(config, { reference: 'M1', hasSuivi: true,
    suiviDateMiseEnService: '2025-04-25', suiviDateDebutInactivite: '2026-10-11' }, ['M1']);
  assert.equal(effective.dateMiseEnService, '2025-04-25');
  assert.equal(effective.dateDebutInactivite, '2026-10-11');
});

const people = [
  { matricule: 'A', codePrepose: '101', valid_from: '2020-01-01', valid_to: null },
  { matricule: 'B', codePrepose: '202', valid_from: '2020-01-01', valid_to: null },
];

test('attribue les opérations et versements à la guichetière affectée à leur date', () => {
  const result = buildMobiDaily({
    points: [
      { terminalReference: 'M1', guichetiereMatricule: 'A', dateDebutValidite: '2026-10-01', dateFinValidite: '2026-10-03' },
      { terminalReference: 'M1', guichetiereMatricule: 'B', dateDebutValidite: '2026-10-03', dateFinValidite: null },
    ],
    guichetieres: people, terminalReference: 'M1', serviceDate: '2026-10-01', endDate: '2026-10-04',
    ccopeRows: [
      { date_op: '2026-10-02T12:00:00Z', operateur: '101', mt_enr: 120, mt_anc: 20 },
      { date_op: '2026-10-03T12:00:00Z', operateur: '101', mt_enr: 50 },
      { date_op: '2026-10-04T12:00:00Z', operateur: '202', mt_enr: 200 },
    ],
    versements: [
      { date_versement: '2026-10-02', guichetiere_code: '101', montant: 80 },
      { date_versement: '2026-10-04', guichetiere_code: '202', montant: 180 },
    ],
  });
  assert.equal(result.daily[1].caNet, 100);
  assert.equal(result.daily[1].mtVerse, 80);
  assert.equal(result.daily[1].mtEnr, 120);
  assert.equal(result.daily[1].annulations, 20);
  assert.equal(result.daily[1].ccopeCount, 1);
  assert.equal(result.daily[1].versementCount, 1);
  assert.equal(result.daily[2].codePrepose, null);
  assert.equal(result.daily[3].caNet, 200);
  assert.equal(result.daily[3].mtVerse, 180);
  assert.equal(result.unresolvedDays, 1);
});

test('écarte les montants lorsqu’un même code est affecté à deux terminaux le même jour', () => {
  const result = buildMobiDaily({
    points: [
      { terminalReference: 'M1', guichetiereMatricule: 'A', dateDebutValidite: '2026-10-01' },
      { terminalReference: 'M2', guichetiereMatricule: 'A', dateDebutValidite: '2026-10-01' },
    ],
    guichetieres: people, terminalReference: 'M1', serviceDate: '2026-10-01', endDate: '2026-10-01',
    ccopeRows: [{ date_op: '2026-10-01', operateur: '101', mt_enr: 100 }],
    versements: [{ date_versement: '2026-10-01', guichetiere_code: '101', montant: 75 }],
  });
  assert.equal(result.daily[0].caNet, 0);
  assert.equal(result.daily[0].mtVerse, 0);
  assert.equal(result.ambiguousOperations, 1);
  assert.equal(result.ambiguousVersements, 1);
});

test('regroupe les jours et ajuste la date de rentabilité selon l’objectif', () => {
  const config = { prixAchat: 500, objectifCaNetJour: 200, objectifVerseJour: 150,
    coefficientObjectif: 100, tauxContribution: 50, amortissementMois: 24, charges: [] };
  const daily = enrichMobiDaily([
    { day: '2026-10-01', caNet: 100, mtVerse: 100 },
    { day: '2026-10-02', caNet: 100, mtVerse: 100 },
  ], config);
  const summary = calculateMobiSummary(daily, config, '2026-10-02', 1);
  assert.equal(groupMobiDaily(daily, 'mois')[0].mtVerse, 200);
  assert.equal(summary.remaining, 400);
  assert.equal(summary.projectedDays, 4);
  assert.equal(summary.projectionDate, '2026-10-06');
  assert.equal(summary.inactivityLoss, 50);
});

test('compte une charge ponctuelle dans le réalisé sans la prolonger dans la projection', () => {
  const config = { prixAchat: 200, objectifCaNetJour: 100, coefficientObjectif: 100,
    tauxContribution: 100, charges: [{ libelle: 'Installation', montant: 40,
      frequence: 'ponctuelle', ponderation: 100, dateDebut: '2026-10-01' }] };
  const daily = enrichMobiDaily([{ day: '2026-10-01', caNet: 100, mtVerse: 0 }], config);
  const summary = calculateMobiSummary(daily, config, '2026-10-01', 0);
  assert.equal(summary.charges, 40);
  assert.equal(summary.remaining, 140);
  assert.equal(summary.projectedDays, 2);
});

test('ne transforme pas un jour antérieur à la couverture source en objectif manqué', () => {
  const daily = enrichMobiDaily([
    { day: '2026-10-01', caNet: 0, mtVerse: 0 },
    { day: '2026-10-02', caNet: 20, mtVerse: 15 },
  ], { objectifCaNetJour: 100, objectifVerseJour: 80, coefficientObjectif: 100, charges: [] },
  { ca: '2026-10-02', verse: '2026-10-02' });
  const grouped = groupMobiDaily(daily, 'jour');
  assert.equal(grouped[0].caKnownDays, 0);
  assert.equal(grouped[0].objectifVerse, 0);
  assert.equal(grouped[1].objectifVerse, 80);
  assert.equal(enrichMobiDaily([{ day: '2026-10-02' }], { charges: [] }, { ca: null, verse: null })[0].caKnown, false);
});

test('trace le capital initial, les investissements complémentaires et le premier franchissement de zéro', () => {
  const entry = { serviceDate: '2026-01-01', config: { tauxContribution: 100, amortissementMois: 12,
    investissements: [{ date: '2026-01-01', montant: 100 }, { date: '2026-01-05', montant: 30 }] }, daily: [
    { day: '2026-01-01', caNet: 0, charges: 0 },
    { day: '2026-01-02', caNet: 50, charges: 0 },
    { day: '2026-01-03', caNet: 50, charges: 0 },
    { day: '2026-01-04', caNet: 20, charges: 0 },
    { day: '2026-01-05', caNet: 0, charges: 0 },
    { day: '2026-01-06', caNet: 10, charges: 0 },
  ] };
  const result = mobiEconomicSeries([entry], '', '', '2026-01-06');
  assert.equal(result.series[0].balance, -100);
  assert.equal(result.series[0].stage, 'Capital engagé');
  assert.equal(result.firstPaybackDate, '2026-01-03');
  assert.deepEqual(result.series.filter((row) => row.stage === 'Fin de journée').map((row) => row.balance),
    [-100, -50, 0, 20, -10, 0]);
  assert.equal(mobiEconomicSeries([entry], '2026-01-04', '2026-01-05', '2026-01-06').series[0].balance, 20);
});

test('interrompt la courbe quand la couverture CCOPE ne remonte pas à la mise en service', () => {
  const entry = { serviceDate: '2026-01-01', config: { tauxContribution: 100,
    investissements: [{ date: '2026-01-01', montant: 100 }] }, daily: [
    { day: '2026-01-01', caNet: 0, charges: 0, caKnown: false },
    { day: '2026-01-02', caNet: 0, charges: 0, caKnown: false },
    { day: '2026-01-03', caNet: 120, charges: 0, caKnown: true },
  ] };
  const result = mobiEconomicSeries([entry], '', '', '2026-01-03');
  assert.equal(result.series[0].balance, -100);
  assert.deepEqual(result.series.slice(1).map((row) => row.balance), [null, null, 20]);
  assert.equal(result.series[1].stage, 'Données indisponibles');
  assert.equal(result.hasCoverageGap, true);
  assert.equal(result.firstPaybackDate, '2026-01-03');
  const report = mobiFullProfitability([{ ...entry, daily: entry.daily.map((row) => ({
    ...row, verseKnown: row.day === '2026-01-03',
  })) }], 'jour', '', '', '2026-01-03');
  assert.equal(report.periods[0].caKnown, false);
  assert.equal(report.periods[0].verseKnown, false);
  assert.equal(report.periods[2].caKnown, true);
  assert.equal(report.periods[2].verseKnown, true);
});

test('détaille une journée avec code préposé, sources et postes financiers', () => {
  const attribution = buildMobiDaily({
    points: [{ terminalReference: 'M1', guichetiereMatricule: 'B', guichetiereNom: 'BAH',
      agenceNom: 'PCD Gare', dateDebutValidite: '2026-10-03' }],
    guichetieres: people, terminalReference: 'M1', serviceDate: '2026-10-03', endDate: '2026-10-03',
    ccopeRows: [{ date_op: '2026-10-03', operateur: '202', mt_enr: 120, mt_anc: 20 }],
    versements: [{ date_versement: '2026-10-03', guichetiere_code: '202', montant: 80 }],
  });
  const config = { tauxContribution: 50,
    investissements: [{ date: '2026-10-03', libelle: 'Achat', montant: 30 }],
    charges: [{ libelle: 'Connexion', montant: 10, frequence: 'journaliere', dateDebut: '2026-10-03' }] };
  const daily = enrichMobiDaily(attribution.daily, config, { ca: '2026-10-03', verse: '2026-10-03' });
  const [detail] = mobiDayDetails([{ reference: 'M1', serviceDate: '2026-10-03', config, daily }], '2026-10-03');
  assert.equal(detail.guichetiereNom, 'BAH');
  assert.equal(detail.codePrepose, '202');
  assert.equal(detail.mtEnr, 120);
  assert.equal(detail.annulations, 20);
  assert.equal(detail.caNet, 100);
  assert.equal(detail.mtVerse, 80);
  assert.equal(detail.chargesTotal, 10);
  assert.equal(detail.investmentTotal, 30);
  assert.equal(detail.revenue, 50);
  assert.equal(detail.margin, 40);
  assert.equal(detail.ccopeCount, 1);
  assert.equal(detail.versementCount, 1);
});

test('conserve les taux de récupération à 100 %, au-dessus et en dessous de zéro', () => {
  const entry = { serviceDate: '2026-01-01', config: { tauxContribution: 100,
    investissements: [{ date: '2026-01-01', montant: 100 }] }, daily: [
    { day: '2026-01-01', caNet: 0, charges: 10 },
    { day: '2026-01-02', caNet: 110, charges: 0 },
    { day: '2026-01-03', caNet: 30, charges: 0 },
  ] };
  assert.equal(mobiFullProfitability([entry], 'jour', '', '', '2026-01-01').totals.recoveryPercent, -10);
  assert.equal(mobiFullProfitability([entry], 'jour', '', '', '2026-01-02').totals.recoveryPercent, 100);
  assert.equal(mobiFullProfitability([entry], 'jour', '', '', '2026-01-03').totals.recoveryPercent, 130);
  assert.equal(mobiEconomicSeries([entry], '', '', '2026-01-03').firstPaybackDate, '2026-01-02');
});

test('ne classe pas un terminal comme rentable sans règle de revenu', () => {
  const terminal = [{ reference: 'M1' }];
  const entry = { serviceDate: '2026-01-01', config: { tauxContribution: '' },
    summary: { investment: 100, contribution: 0, caNet: 50, charges: 0, remaining: 100 },
    daily: [{ day: '2026-01-01', caNet: 50, caKnown: true }], grouped: [] };
  assert.equal(mobiParkRows(terminal, { M1: entry })[0].financialStatus, 'Données insuffisantes');
  assert.equal(mobiParkRows(terminal, { M1: { ...entry, config: { tauxContribution: 50 } } })[0].financialStatus, 'En cours');
});

test('projette sur la marge observée sans interpréter une donnée absente comme une journée à zéro', () => {
  const entry = { config: { tauxContribution: 100 }, summary: { investment: 100, contribution: 30 }, daily: [
    { day: '2026-10-01', caNet: 10, charges: 0, caKnown: true },
    { day: '2026-10-02', caNet: 20, charges: 0, caKnown: true },
    { day: '2026-10-03', caNet: 0, charges: 0, caKnown: false },
  ] };
  const result = mobiObservedProjection([entry], '2026-10-03', 30);
  assert.equal(result.average, 15);
  assert.equal(result.observedDays, 2);
  assert.equal(result.totalDays, 3);
  assert.equal(result.projectedDays, 5);
  assert.equal(result.projectionDate, '2026-10-08');
  assert.equal(mobiObservedProjection([{ ...entry, daily: [{ day: '2026-10-03', caNet: 0, charges: 10, caKnown: true }] }], '2026-10-03').projectionDate, null);
});

test('reprend les investissements et objectifs historiques une seule fois', () => {
  const config = normalizeMobiConfig({ prixAchat: 500, fraisTransport: 50,
    objectifCaNetJour: 100, objectifVerseJour: 80, coefficientObjectif: 75,
    tauxContribution: 50 }, '2026-10-01');
  assert.equal(config.investissements.length, 2);
  assert.equal(config.objectifs.length, 2);
  const daily = enrichMobiDaily([{ day: '2026-10-01', caNet: 0, mtVerse: 0 }], config);
  assert.equal(daily[0].objectifCaNet, 75);
  assert.equal(daily[0].objectifVerse, 60);
  assert.equal(calculateMobiSummary(daily, config, '2026-10-01').investment, 550);
  const cleared = { ...config, investissements: [], objectifs: [] };
  assert.equal(calculateMobiSummary(daily, cleared, '2026-10-01').investment, 0);
  assert.equal(enrichMobiDaily([{ day: '2026-10-02' }], cleared)[0].objectifCaNet, 0);
});

test('additionne les investissements datés et prorate les objectifs récurrents', () => {
  const config = normalizeMobiConfig({
    investissements: [
      { id: '1', libelle: 'Achat', montant: 1000, date: '2026-10-01' },
      { id: '2', libelle: 'Transport', montant: 200, date: '2026-10-03' },
    ],
    objectifs: [
      { id: 'a', metrique: 'ca_net', montant: 310, frequence: 'mensuelle',
        ponderation: 50, dateDebut: '2026-10-01' },
      { id: 'b', metrique: 'mt_verse', montant: 70, frequence: 'hebdomadaire',
        ponderation: 100, dateDebut: '2026-10-02' },
    ],
    tauxContribution: 100,
  }, '2026-10-01');
  const daily = enrichMobiDaily([
    { day: '2026-10-01', caNet: 0, mtVerse: 0 },
    { day: '2026-10-02', caNet: 0, mtVerse: 0 },
  ], config);
  assert.equal(daily[0].objectifCaNet, 5);
  assert.equal(daily[0].objectifVerse, 0);
  assert.equal(daily[1].objectifVerse, 10);
  assert.equal(calculateMobiSummary(daily, config, '2026-10-02').investment, 1000);
  assert.equal(calculateMobiSummary(daily, config, '2026-10-03').investment, 1200);
});

test('répartit un paramètre global équitablement ou selon les poids de chaque terminal', () => {
  const references = ['M1', 'M2', 'M3'];
  const item = { montant: 300 };
  assert.equal(mobiAllocationShare(item, 'M1', references), 1 / 3);
  const weighted = { ...item, repartition: { M1: 50, M2: 25, M3: 25 } };
  assert.equal(mobiAllocationShare(weighted, 'M1', references), 0.5);
  assert.equal(mobiAllocationShare(weighted, 'M2', references), 0.25);
  assert.equal(references.reduce((sum, ref) => sum + mobiAllocationShare(weighted, ref, references), 0), 1);
  assert.equal(mobiAllocationShare({ ...item, terminalReference: 'M2' }, 'M1', references), 0);
  assert.equal(mobiAllocationShare({ ...item, terminalReference: 'M2' }, 'M2', references), 1);
});

test('reprend les réglages historiques ciblés et les conserve dans la configuration globale', () => {
  const terminaux = [{ reference: 'M1', dateMiseEnService: '2026-10-01' }, { reference: 'M2', dateMiseEnService: '2026-10-01' }];
  const legacy = { M1: { prixAchat: 600, objectifVerseJour: 100, coefficientObjectif: 80,
    charges: [{ id: 'c', libelle: 'Réseau', montant: 200, frequence: 'mensuelle', ponderation: 100, dateDebut: '2026-10-01' }] } };
  const global = normalizeMobiGlobalConfig({ investissements: [{ id: 'g', libelle: 'Installation', montant: 400, date: '2026-10-01' }] }, legacy, terminaux);
  assert.equal(global.investissements.length, 2);
  assert.equal(global.objectifs.length, 1);
  assert.equal(global.charges.length, 1);
  const first = allocateMobiConfig(global, terminaux[0], ['M1', 'M2']);
  const second = allocateMobiConfig(global, terminaux[1], ['M1', 'M2']);
  assert.equal(first.investissements.reduce((sum, item) => sum + item.montant, 0), 800);
  assert.equal(second.investissements.reduce((sum, item) => sum + item.montant, 0), 200);
  assert.equal(enrichMobiDaily([{ day: '2026-10-01' }], first)[0].objectifVerse, 80);
  assert.equal(enrichMobiDaily([{ day: '2026-10-01' }], second)[0].objectifVerse, 0);
  assert.equal(normalizeMobiGlobalConfig(global, legacy, terminaux).investissements.length, 2);
});

test('calcule les poids automatiques depuis le CA net observé', () => {
  const history = {
    M1: { daily: [{ day: '2026-10-01', caNet: 75, mtVerse: 10, caKnown: true }] },
    M2: { daily: [{ day: '2026-10-01', caNet: 25, mtVerse: 30, caKnown: true }] },
  };
  assert.deepEqual(mobiWeightsFromHistory(history, ['M1', 'M2'], 'ca_net', '2026-10-01', '2026-10-01'), { M1: 75, M2: 25 });
  assert.deepEqual(mobiWeightsFromHistory(history, ['M1', 'M2'], 'mt_verse', '2026-10-01', '2026-10-01'), { M1: 25, M2: 75 });
  assert.equal(mobiWeightsFromHistory(history, ['M1', 'M2'], 'ca_net', '2026-09-01', '2026-09-30'), null);
});

test('ne présente pas de retour sur investissement sans capital ou avant le dernier investissement', () => {
  const rows = [{ day: '2026-10-01', caNet: 1000, mtVerse: 0 }, { day: '2026-10-02', caNet: 0, mtVerse: 0 }];
  const empty = { investissements: [], objectifs: [], charges: [], tauxContribution: 100 };
  assert.equal(calculateMobiSummary(enrichMobiDaily(rows, empty), empty, '2026-10-02').projectionDate, null);
  const config = { ...empty, investissements: [
    { id: 'a', montant: 100, date: '2026-10-01' }, { id: 'b', montant: 100, date: '2026-10-02' },
  ] };
  assert.equal(calculateMobiSummary(enrichMobiDaily(rows, config), config, '2026-10-02').actualPaybackDate, '2026-10-02');
});

test('conserve les totaux des objectifs et charges du parc après répartition', () => {
  const terminaux = [{ reference: 'M1', dateMiseEnService: '2026-10-01' }, { reference: 'M2', dateMiseEnService: '2026-10-01' }];
  const global = normalizeMobiGlobalConfig({
    objectifs: [{ id: 'o', libelle: 'CA', metrique: 'ca_net', montant: 300,
      frequence: 'journaliere', ponderation: 100, dateDebut: '2026-10-01', repartition: { M1: 2, M2: 1 } }],
    charges: [{ id: 'c', libelle: 'Réseau', montant: 310, frequence: 'mensuelle',
      ponderation: 100, dateDebut: '2026-10-01' }],
  }, {}, terminaux);
  const perTerminal = terminaux.map((terminal) => {
    const config = allocateMobiConfig(global, terminal, ['M1', 'M2']);
    return enrichMobiDaily([{ day: '2026-10-01', caNet: 0, mtVerse: 0 }], config)[0];
  });
  assert.equal(perTerminal[0].objectifCaNet, 200);
  assert.equal(perTerminal[1].objectifCaNet, 100);
  assert.equal(perTerminal.reduce((sum, row) => sum + row.charges, 0), 10);
});

test('calcule un objectif CA net à partir des investissements et charges, puis le répartit', () => {
  const terminaux = [{ reference: 'M1' }, { reference: 'M2' }];
  const config = normalizeMobiGlobalConfig({
    tauxContribution: 50, amortissementMois: 12,
    investissements: [{ id: 'i', montant: 3650, date: '2026-01-01' }],
    charges: [{ id: 'c', montant: 5, frequence: 'journaliere', ponderation: 100, dateDebut: '2026-01-01' }],
    objectifs: [{ id: 'o', libelle: 'Seuil de rentabilité', metrique: 'ca_net', modeCalcul: 'rentabilite',
      montant: 0, ponderation: 100, dateDebut: '2026-01-01', repartition: { M1: 75, M2: 25 } }],
  }, {}, terminaux);
  assert.equal(mobiInvestmentAmortizationForDay(config.investissements[0], '2026-01-01', 12), 10);
  const first = allocateMobiConfig(config, terminaux[0], ['M1', 'M2']);
  const second = allocateMobiConfig(config, terminaux[1], ['M1', 'M2']);
  assert.equal(mobiRentabilityTargetForDay(first, first.objectifs[0], '2026-01-01').requiredCaNet, 22.5);
  assert.equal(enrichMobiDaily([{ day: '2026-01-01' }], first)[0].objectifCaNet, 22.5);
  assert.equal(enrichMobiDaily([{ day: '2026-01-01' }], second)[0].objectifCaNet, 7.5);
  assert.equal(mobiRentabilityTargetForDay(first, { ...first.objectifs[0], inclureInvestissements: false }, '2026-01-01').requiredCaNet, 7.5);
  config.charges[0].montant = 7;
  assert.equal(enrichMobiDaily([{ day: '2026-01-02' }], first)[0].objectifCaNet, 25.5);
  assert.equal(enrichMobiDaily([{ day: '2027-01-01' }], first)[0].objectifCaNet, 10.5);
});

test('distingue résultat après dotation, récupération du capital et versements dans le calcul complet', () => {
  const entries = [{ serviceDate: '2026-01-03', config: { tauxContribution: 50, amortissementMois: 1,
    investissements: [{ date: '2026-01-01', montant: 100 }] }, daily: [
    { day: '2026-01-03', caNet: 50, mtVerse: 30, charges: 5 },
    { day: '2026-01-04', caNet: 100, mtVerse: 80, charges: 0 },
    { day: '2026-01-05', caNet: 80, mtVerse: 20, charges: 0 },
  ] }];
  assert.equal(mobiInvestmentAmortizationForDay(entries[0].config.investissements[0], '2026-01-02', 1, '2026-01-03'), 0);
  const result = mobiFullProfitability(entries, 'jour', '2026-01-04', '2026-01-05', '2026-01-05');
  assert.equal(result.totals.investment, 100);
  assert.equal(result.totals.caNet, 230);
  assert.equal(result.totals.mtVerse, 130);
  assert.equal(result.totals.charges, 5);
  assert.equal(result.totals.contribution, 110);
  assert.equal(result.totals.netAfterCapital, 10);
  assert.ok(Math.abs(result.totals.recoveryPercent - 110) < 0.0001);
  assert.ok(Math.abs(result.totals.roiPercent - 10) < 0.0001);
  assert.equal(result.totals.paybackDate, '2026-01-05');
  assert.ok(Math.abs(result.totals.depreciation - 300 / 31) < 0.0001);
  assert.ok(Math.abs(result.totals.operatingResult - (110 - 300 / 31)) < 0.0001);
  assert.deepEqual(result.periods.map((row) => [row.period, row.cumulativeInvestment, row.cumulativeContribution, row.remaining]),
    [['2026-01-04', 100, 70, 30], ['2026-01-05', 100, 110, 0]]);
});

test('retire le statut remboursé si des charges font repasser le cumul sous le capital', () => {
  const result = mobiFullProfitability([{ serviceDate: '2026-01-01', config: { tauxContribution: 100,
    amortissementMois: 12, investissements: [{ date: '2026-01-01', montant: 100 }] }, daily: [
    { day: '2026-01-01', caNet: 120, mtVerse: 0, charges: 0 },
    { day: '2026-01-02', caNet: 0, mtVerse: 0, charges: 30 },
  ] }], 'jour', '', '', '2026-01-02');
  assert.equal(result.totals.paybackDate, null);
  assert.equal(result.totals.remaining, 10);
});

test('applique une charge en pourcentage au CA net de chaque Mobi sans diviser son taux', () => {
  const day = '2026-10-14';
  const variable = { id: 'v', typeMontant: 'pourcentage_ca', montant: 5, ponderation: 100, dateDebut: day };
  assert.equal(chargeForDay(variable, day, 1000), 50);
  assert.equal(chargeForDay(variable, day, -100), 0);
  assert.equal(chargeForDay({ ...variable, ponderation: 50 }, day, 1000), 25);
  const terminals = [{ reference: 'M1' }, { reference: 'M2' }];
  const global = normalizeMobiGlobalConfig({ charges: [variable, {
    id: 'f', montant: 310, frequence: 'mensuelle', ponderation: 100, dateDebut: '2026-10-01',
  }] }, {}, terminals);
  const first = allocateMobiConfig(global, terminals[0], ['M1', 'M2']);
  const second = allocateMobiConfig(global, terminals[1], ['M1', 'M2']);
  const firstDay = enrichMobiDaily([{ day, caNet: 1000 }], first)[0];
  const secondDay = enrichMobiDaily([{ day, caNet: 500 }], second)[0];
  assert.equal(firstDay.charges, 55);
  assert.equal(secondDay.charges, 30);
  assert.equal(firstDay.charges + secondDay.charges, 85);
});

test('déduit les charges variables de la marge disponible pour l’objectif de rentabilité', () => {
  const day = '2026-10-14';
  const charges = [
    { typeMontant: 'fixe', montant: 10, frequence: 'journaliere', ponderation: 100, dateDebut: day },
    { typeMontant: 'pourcentage_ca', montant: 5, ponderation: 100, dateDebut: day },
  ];
  const objective = { dateDebut: day, ponderation: 100, inclureInvestissements: false, inclureCharges: true };
  const result = mobiRentabilityTargetForDay({ charges, investissements: [], tauxContribution: 20 }, objective, day);
  assert.ok(Math.abs(result.requiredCaNet - 10 / 0.15) < 0.0001);
  assert.ok(Math.abs(result.variableCharges - result.requiredCaNet * 0.05) < 0.0001);
  assert.equal(mobiMaxVariableChargeRate(charges, day), 0.05);
  assert.equal(mobiRentabilityTargetForDay({ charges, investissements: [], tauxContribution: 5 }, objective, day).requiredCaNet, null);
});
