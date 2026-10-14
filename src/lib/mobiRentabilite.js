const dayKey = (value) => String(value || '').slice(0, 10);
const amount = (value) => Number(value) || 0;

export const addDays = (day, count) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

export const mobiDatesFromSuivi = (terminal, suivi, today) => {
  const sourceDate = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? dayKey(value) : '';
  const dateMiseEnService = sourceDate(suivi?.premiere_utilisation);
  const lastUse = sourceDate(suivi?.derniere_utilisation);
  const dateDebutInactivite = terminal.statut === 'Inactif' && lastUse && lastUse < today
    && (!dateMiseEnService || lastUse >= dateMiseEnService) ? addDays(lastUse, 1) : '';
  return { dateMiseEnService, dateDebutInactivite };
};

const dateInWindow = (day, start, end) => day >= start && (!end || day < end);

const legacyInvestments = [
  ['prixAchat', "Prix d'achat"], ['fraisTransport', 'Transport'],
  ['fraisDedouanement', 'Dédouanement'], ['fraisConfiguration', 'Configuration'],
  ['autresFrais', 'Autres frais'],
];

export const normalizeMobiConfig = (saved = {}, fallbackDate = '') => ({
  ...saved,
  dateMiseEnService: saved.dateMiseEnService || fallbackDate,
  dateDebutInactivite: saved.dateDebutInactivite || '',
  tauxContribution: saved.tauxContribution ?? '',
  amortissementMois: saved.amortissementMois ?? 36,
  investissements: Array.isArray(saved.investissements) ? saved.investissements : legacyInvestments
    .filter(([key]) => amount(saved[key]) > 0)
    .map(([key, libelle]) => ({ id: `legacy-${key}`, libelle, montant: saved[key], date: saved.dateMiseEnService || fallbackDate })),
  objectifs: Array.isArray(saved.objectifs) ? saved.objectifs : [
    ['ca_net', 'objectifCaNetJour', 'CA net'], ['mt_verse', 'objectifVerseJour', 'MT versé'],
  ].filter(([, key]) => amount(saved[key]) > 0)
    .map(([metrique, key, libelle]) => ({ id: `legacy-${key}`, libelle, metrique,
      montant: saved[key], frequence: 'journaliere', ponderation: saved.coefficientObjectif ?? 100,
      dateDebut: saved.dateMiseEnService || fallbackDate, dateFin: '' })),
  charges: Array.isArray(saved.charges) ? saved.charges : [],
});

export const normalizeMobiGlobalConfig = (saved = {}, legacyByTerminal = {}, terminaux = []) => {
  const imported = { investissements: [], objectifs: [], charges: [] };
  const terminalRules = {};
  for (const terminal of terminaux) {
    const reference = terminal.reference;
    const legacy = legacyByTerminal[reference];
    if (!legacy) continue;
    const normalized = normalizeMobiConfig(legacy, terminal.dateMiseEnService || '');
    terminalRules[reference] = {
      dateMiseEnService: normalized.dateMiseEnService,
      dateDebutInactivite: normalized.dateDebutInactivite,
      tauxContribution: normalized.tauxContribution,
      amortissementMois: normalized.amortissementMois,
    };
    if (saved.legacyImported) continue;
    for (const key of Object.keys(imported)) {
      imported[key].push(...normalized[key].map((item, index) => ({ ...item,
        id: `legacy:${reference}:${key}:${item.id || index}`, terminalReference: reference })));
    }
  }
  return {
    tauxContribution: saved.tauxContribution ?? '',
    amortissementMois: saved.amortissementMois ?? '',
    investissements: [...(Array.isArray(saved.investissements) ? saved.investissements : []), ...imported.investissements],
    objectifs: [...(Array.isArray(saved.objectifs) ? saved.objectifs : []), ...imported.objectifs],
    charges: [...(Array.isArray(saved.charges) ? saved.charges : []), ...imported.charges],
    terminalRules: { ...terminalRules, ...(saved.terminalRules || {}) },
    legacyImported: true,
  };
};

export const mobiAllocationShare = (item, terminalReference, references) => {
  if (item.terminalReference) return item.terminalReference === terminalReference ? 1 : 0;
  if (!references.includes(terminalReference)) return 0;
  const weights = item.repartition || {};
  const totalWeight = references.reduce((total, reference) => total + Math.max(0, amount(weights[reference])), 0);
  if (totalWeight > 0) return Math.max(0, amount(weights[terminalReference])) / totalWeight;
  return references.length ? 1 / references.length : 0;
};

export const mobiWeightsFromHistory = (historyByTerminal, references, metric, start, end) => {
  const values = Object.fromEntries(references.map((reference) => [reference,
    (historyByTerminal[reference]?.daily || [])
      .filter((row) => (!start || row.day >= start) && (!end || row.day <= end)
        && (metric === 'ca_net' ? row.caKnown !== false : row.verseKnown !== false))
      .reduce((total, row) => total + Math.max(0, amount(metric === 'ca_net' ? row.caNet : row.mtVerse)), 0)]));
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return Object.fromEntries(references.map((reference) => [reference,
    Number((values[reference] / total * 100).toFixed(4))]));
};

export const allocateMobiConfig = (globalConfig, terminal, references) => {
  const reference = terminal.reference;
  const rules = globalConfig.terminalRules?.[reference] || {};
  const allocate = (key) => (globalConfig[key] || [])
    .map((item) => {
      const share = key === 'charges' && item.typeMontant === 'pourcentage_ca'
        ? (!item.terminalReference || item.terminalReference === reference ? 1 : 0)
        : mobiAllocationShare(item, reference, references);
      return { ...item, montant: amount(item.montant) * share, allocationShare: share };
    })
    .filter((item) => item.allocationShare > 0 && (item.montant > 0 || key === 'objectifs' && item.modeCalcul === 'rentabilite'));
  return {
    investissements: allocate('investissements'),
    objectifs: allocate('objectifs'),
    charges: allocate('charges'),
    objectiveSources: { investissements: globalConfig.investissements || [], charges: globalConfig.charges || [] },
    dateMiseEnService: terminal.suiviDateMiseEnService || rules.dateMiseEnService || terminal.dateMiseEnService || '',
    dateDebutInactivite: terminal.hasSuivi ? terminal.suiviDateDebutInactivite || '' : rules.dateDebutInactivite || '',
    tauxContribution: globalConfig.tauxContribution !== '' ? globalConfig.tauxContribution : rules.tauxContribution || '',
    amortissementMois: globalConfig.amortissementMois || rules.amortissementMois || 36,
  };
};

const codeForMatricule = (day, versions) => {
  const valid = versions.filter((person) => dateInWindow(
    day,
    dayKey(person.valid_from) || '0000-01-01',
    person.valid_to ? addDays(dayKey(person.valid_to), 1) : null,
  ));
  const codes = [...new Set(valid.map((person) => String(person.codePrepose).trim()))];
  if (codes.length === 1) return codes[0];
  if (codes.length > 1) return null;
  const historicalCodes = [...new Set(versions.map((person) => String(person.codePrepose).trim()))];
  return historicalCodes.length === 1 ? historicalCodes[0] : null;
};

const pointActiveOn = (point, day) => dateInWindow(
  day,
  dayKey(point.dateDebutValidite) || dayKey(point.created_at) || '0000-01-01',
  point.dateFinValidite ? addDays(dayKey(point.dateFinValidite), 1) : null,
);

export const buildMobiDaily = ({ points, guichetieres, terminalReference, serviceDate, endDate, ccopeRows, versements }) => {
  const daily = [];
  const byDay = new Map();
  const ownerCache = new Map();
  const codeCache = new Map();
  let unresolvedDays = 0;
  let ambiguousOperations = 0;
  let ambiguousVersements = 0;

  const peopleByMatricule = new Map();
  guichetieres.forEach((person) => {
    const matricule = String(person.matricule || '').trim();
    if (!matricule || !person.codePrepose) return;
    if (!peopleByMatricule.has(matricule)) peopleByMatricule.set(matricule, []);
    peopleByMatricule.get(matricule).push(person);
  });
  const selectedPoints = points.filter((point) => point.terminalReference === terminalReference);
  const candidateCodes = new Set(selectedPoints.flatMap((point) =>
    (peopleByMatricule.get(String(point.guichetiereMatricule || '').trim()) || [])
      .map((person) => String(person.codePrepose).trim())));
  const relevantPoints = points.filter((point) =>
    (peopleByMatricule.get(String(point.guichetiereMatricule || '').trim()) || [])
      .some((person) => candidateCodes.has(String(person.codePrepose).trim())));
  const codeFor = (matricule, day) => {
    const key = `${matricule}|${day}`;
    if (codeCache.has(key)) return codeCache.get(key);
    const code = codeForMatricule(day, peopleByMatricule.get(String(matricule || '').trim()) || []);
    codeCache.set(key, code);
    return code;
  };

  for (let day = serviceDate; day <= endDate; day = addDays(day, 1)) {
    const assignments = selectedPoints.filter((point) => pointActiveOn(point, day));
    const codes = [...new Set(assignments.map((point) => codeFor(point.guichetiereMatricule, day)).filter(Boolean))];
    if (assignments.length > 0 && codes.length !== 1) unresolvedDays += 1;
    const row = { day, caNet: 0, mtVerse: 0, codePrepose: codes.length === 1 ? codes[0] : null, assigned: assignments.length > 0 };
    daily.push(row);
    byDay.set(day, row);
  }

  const ownerFor = (day, code) => {
    const key = `${day}|${code}`;
    if (ownerCache.has(key)) return ownerCache.get(key);
    const owners = [...new Set(relevantPoints.filter((point) => pointActiveOn(point, day)
      && codeFor(point.guichetiereMatricule, day) === code)
      .map((point) => point.terminalReference).filter(Boolean))];
    const owner = owners.length === 1 ? owners[0] : null;
    ownerCache.set(key, owner);
    return owner;
  };

  ccopeRows.forEach((row) => {
    const day = dayKey(row.date_op);
    const code = String(row.operateur || '').trim();
    if (!byDay.has(day) || byDay.get(day).codePrepose !== code) return;
    if (ownerFor(day, code) !== terminalReference) { ambiguousOperations += 1; return; }
    byDay.get(day).caNet += amount(row.mt_enr)
      - amount(row.mt_anc) - amount(row.mt_ane) - amount(row.mt_anm) - amount(row.mt_ans);
  });

  versements.forEach((row) => {
    const day = dayKey(row.date_versement);
    const code = String(row.guichetiere_code || '').trim();
    if (!byDay.has(day) || byDay.get(day).codePrepose !== code) return;
    if (ownerFor(day, code) !== terminalReference) { ambiguousVersements += 1; return; }
    byDay.get(day).mtVerse += amount(row.montant);
  });

  return { daily, unresolvedDays, ambiguousOperations, ambiguousVersements };
};

const daysInYear = (day) => {
  const year = Number(day.slice(0, 4));
  return new Date(Date.UTC(year + 1, 0, 1)) - new Date(Date.UTC(year, 0, 1)) === 366 * 86400000 ? 366 : 365;
};

export const chargeForDay = (charge, day, caNet = 0) => {
  if (!dateInWindow(day, charge.dateDebut || '0000-01-01', charge.dateFin ? addDays(charge.dateFin, 1) : null)) return 0;
  const weighted = amount(charge.montant) * Math.max(0, Math.min(100, amount(charge.ponderation ?? 100))) / 100;
  if (charge.typeMontant === 'pourcentage_ca') return Math.max(0, amount(caNet)) * weighted / 100;
  switch (charge.frequence) {
    case 'ponctuelle': return day === charge.dateDebut ? weighted : 0;
    case 'hebdomadaire': return weighted / 7;
    case 'mensuelle': return weighted / new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
    case 'annuelle': return weighted / daysInYear(day);
    default: return weighted;
  }
};

export const mobiVariableChargeRateForDay = (charges, day) => (charges || [])
  .filter((charge) => charge.typeMontant === 'pourcentage_ca')
  .reduce((total, charge) => total + chargeForDay(charge, day, 100), 0) / 100;

export const mobiMaxVariableChargeRate = (charges, start, end = '') => {
  const dates = [start, ...(charges || []).filter((charge) => charge.typeMontant === 'pourcentage_ca')
    .map((charge) => charge.dateDebut)].filter((day) => day && day >= start && (!end || day <= end));
  return Math.max(0, ...dates.map((day) => mobiVariableChargeRateForDay(charges, day)));
};

const addMonths = (day, months) => {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1 + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Number(day.slice(8, 10)), lastDay))).toISOString().slice(0, 10);
};

export const mobiInvestmentAmortizationForDay = (investment, day, months, serviceDate = '') => {
  const purchaseDate = dayKey(investment.date);
  const start = serviceDate && serviceDate > purchaseDate ? serviceDate : purchaseDate;
  const duration = Number(months);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(duration) || duration < 1) return 0;
  const end = addMonths(start, duration);
  if (day < start || day >= end) return 0;
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  return days > 0 ? amount(investment.montant) / days : 0;
};

export const mobiRentabilityTargetForDay = (config, objective, day) => {
  const empty = { investment: 0, charges: 0, fixedCharges: 0, variableCharges: 0, variableRate: 0, requiredCaNet: 0 };
  if (!dateInWindow(day, objective.dateDebut || '0000-01-01', objective.dateFin ? addDays(objective.dateFin, 1) : null)) return empty;
  const rate = amount(config.tauxContribution) / 100;
  const share = amount(objective.allocationShare ?? 1) * Math.max(0, Math.min(100, amount(objective.ponderation ?? 100))) / 100;
  const sources = config.objectiveSources || config;
  const investment = objective.inclureInvestissements !== false
    ? (sources.investissements || []).reduce((sum, item) => sum + mobiInvestmentAmortizationForDay(item, day, config.amortissementMois), 0) * share : 0;
  const fixedCharges = objective.inclureCharges !== false
    ? (sources.charges || []).filter((item) => item.typeMontant !== 'pourcentage_ca')
      .reduce((sum, item) => sum + chargeForDay(item, day), 0) * share : 0;
  const variableRate = objective.inclureCharges !== false
    ? mobiVariableChargeRateForDay(sources.charges, day) : 0;
  const margin = rate - variableRate;
  const requiredCaNet = margin > 0 ? (investment + fixedCharges) / margin : null;
  const variableCharges = requiredCaNet == null ? 0 : requiredCaNet * variableRate;
  return { investment, fixedCharges, variableCharges, variableRate,
    charges: fixedCharges + variableCharges, requiredCaNet };
};

export const objectiveForDay = (config, metric, day) => {
  if (Array.isArray(config.objectifs)) return config.objectifs
    .filter((objective) => objective.metrique === metric)
    .reduce((total, objective) => total + (objective.modeCalcul === 'rentabilite' && metric === 'ca_net'
      ? mobiRentabilityTargetForDay(config, objective, day).requiredCaNet || 0 : chargeForDay(objective, day)), 0);
  const key = metric === 'ca_net' ? 'objectifCaNetJour' : 'objectifVerseJour';
  return amount(config[key]) * Math.max(0, amount(config.coefficientObjectif ?? 100)) / 100;
};

export const enrichMobiDaily = (daily, config, coverage = {}) => {
  return daily.map((row) => {
    const caKnown = !Object.hasOwn(coverage, 'ca') || Boolean(coverage.ca && row.day >= coverage.ca);
    const verseKnown = !Object.hasOwn(coverage, 'verse') || Boolean(coverage.verse && row.day >= coverage.verse);
    return {
      ...row,
      caKnown,
      verseKnown,
      objectifCaNet: caKnown ? objectiveForDay(config, 'ca_net', row.day) : 0,
      objectifVerse: verseKnown ? objectiveForDay(config, 'mt_verse', row.day) : 0,
      charges: (config.charges || []).reduce((total, charge) => total + chargeForDay(charge, row.day, row.caNet), 0),
    };
  });
};

const mobiPeriodKey = (day, granularity) => {
  if (granularity === 'semaine') {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    return addDays(day, -((weekday + 6) % 7));
  }
  if (granularity === 'mois') return day.slice(0, 7);
  if (granularity === 'annee') return day.slice(0, 4);
  return day;
};

export const groupMobiDaily = (daily, granularity) => {
  const grouped = new Map();
  daily.forEach((row) => {
    const key = mobiPeriodKey(row.day, granularity);
    if (!grouped.has(key)) grouped.set(key, { period: key, caNet: 0, mtVerse: 0, objectifCaNet: 0, objectifVerse: 0, charges: 0, days: 0, caKnownDays: 0, verseKnownDays: 0 });
    const result = grouped.get(key);
    result.caNet += row.caNet;
    result.mtVerse += row.mtVerse;
    result.objectifCaNet += row.objectifCaNet;
    result.objectifVerse += row.objectifVerse;
    result.charges += row.charges;
    result.days += 1;
    if (row.caKnown !== false) result.caKnownDays += 1;
    if (row.verseKnown !== false) result.verseKnownDays += 1;
  });
  return [...grouped.values()];
};

export const mobiGapSeries = (grouped) => grouped.map((row) => {
  const objectifComparaisonVerse = row.objectifVerse > 0 ? row.objectifVerse
    : row.objectifCaNet > 0 ? row.objectifCaNet : null;
  const verseGap = row.verseKnownDays > 0 && objectifComparaisonVerse != null
    ? row.mtVerse - objectifComparaisonVerse : null;
  return {
    ...row,
    objectifCaNetTrace: row.objectifCaNet > 0 ? row.objectifCaNet : null,
    objectifVerseTrace: row.objectifVerse > 0 ? row.objectifVerse : null,
    objectifComparaisonVerse,
    comparaisonSurCaNet: !(row.objectifVerse > 0) && row.objectifCaNet > 0,
    ecartCaVerse: row.caKnownDays > 0 && row.caKnownDays === row.verseKnownDays
      ? row.caNet - row.mtVerse : null,
    ecartVerseSurplus: verseGap == null ? null : Math.max(0, verseGap),
    ecartVerseManque: verseGap == null ? null : Math.max(0, -verseGap),
  };
});

export const mobiChartSeries = (daily, granularity, from = '', to = '') => mobiGapSeries(groupMobiDaily(
  daily.filter((row) => (!from || row.day >= from) && (!to || row.day <= to)), granularity,
));

export const mobiAmortizationSeries = (entries, granularity, from = '', to = '', today = '') => {
  const byDay = new Map();
  const dayTotals = (day) => {
    if (!byDay.has(day)) byDay.set(day, { investment: 0, contribution: 0 });
    return byDay.get(day);
  };
  for (const entry of entries) {
    for (const investment of entry.config?.investissements || []) {
      const day = dayKey(investment.date) || entry.serviceDate;
      if (day && (!today || day <= today)) dayTotals(day).investment += amount(investment.montant);
    }
    const rate = amount(entry.config?.tauxContribution) / 100;
    for (const row of entry.daily || []) {
      if (!today || row.day <= today) dayTotals(row.day).contribution += amount(row.caNet) * rate - amount(row.charges);
    }
  }
  let investment = 0;
  let contribution = 0;
  const grouped = new Map();
  for (const day of [...byDay.keys()].sort()) {
    investment += byDay.get(day).investment;
    contribution += byDay.get(day).contribution;
    if ((!from || day >= from) && (!to || day <= to)) {
      const period = mobiPeriodKey(day, granularity);
      grouped.set(period, { period, investment, contribution, remaining: Math.max(0, investment - contribution) });
    }
  }
  return [...grouped.values()];
};

export const mobiFullProfitability = (entries, granularity, from = '', to = '', today = '') => {
  const byDay = new Map();
  const daily = (day) => {
    if (!byDay.has(day)) byDay.set(day, { day, investment: 0, caNet: 0, mtVerse: 0,
      charges: 0, depreciation: 0, contribution: 0, operatingResult: 0 });
    return byDay.get(day);
  };
  const investmentDates = [];
  for (const entry of entries) {
    const investments = entry.config?.investissements || [];
    for (const item of investments) {
      const day = dayKey(item.date) || entry.serviceDate;
      if (!day || today && day > today) continue;
      daily(day).investment += amount(item.montant);
      investmentDates.push(day);
    }
    const rate = amount(entry.config?.tauxContribution) / 100;
    for (const row of entry.daily || []) {
      if (today && row.day > today) continue;
      const target = daily(row.day);
      const depreciation = investments.reduce((sum, item) => sum + mobiInvestmentAmortizationForDay(
        item, row.day, entry.config?.amortissementMois, entry.serviceDate,
      ), 0);
      const contribution = amount(row.caNet) * rate - amount(row.charges);
      target.caNet += amount(row.caNet);
      target.mtVerse += amount(row.mtVerse);
      target.charges += amount(row.charges);
      target.depreciation += depreciation;
      target.contribution += contribution;
      target.operatingResult += contribution - depreciation;
    }
  }
  const totals = { investment: 0, caNet: 0, mtVerse: 0, charges: 0,
    depreciation: 0, contribution: 0, operatingResult: 0 };
  const grouped = new Map();
  const lastInvestmentDate = investmentDates.sort().at(-1);
  let paybackDate = null;
  for (const row of [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))) {
    for (const key of Object.keys(totals)) totals[key] += row[key];
    if (totals.investment > 0 && row.day >= lastInvestmentDate) {
      if (totals.contribution < totals.investment) paybackDate = null;
      else if (!paybackDate) paybackDate = row.day;
    }
    if (from && row.day < from || to && row.day > to) continue;
    const period = mobiPeriodKey(row.day, granularity);
    if (!grouped.has(period)) grouped.set(period, { period, investment: 0, caNet: 0, mtVerse: 0,
      charges: 0, depreciation: 0, contribution: 0, operatingResult: 0,
      cumulativeInvestment: 0, cumulativeContribution: 0, remaining: 0 });
    const target = grouped.get(period);
    for (const key of Object.keys(totals)) target[key] += row[key];
    target.cumulativeInvestment = totals.investment;
    target.cumulativeContribution = totals.contribution;
    target.remaining = Math.max(0, totals.investment - totals.contribution);
  }
  return { totals: { ...totals,
    netAfterCapital: totals.contribution - totals.investment,
    remaining: Math.max(0, totals.investment - totals.contribution),
    recoveryPercent: totals.investment > 0 ? totals.contribution / totals.investment * 100 : null,
    roiPercent: totals.investment > 0 ? (totals.contribution - totals.investment) / totals.investment * 100 : null,
    paybackDate }, periods: [...grouped.values()] };
};

export const mobiEconomicSeries = (entries, from = '', to = '', today = '') => {
  const report = mobiFullProfitability(entries, 'jour', '', '', today);
  const periods = report.periods;
  const firstInvestmentIndex = periods.findIndex((row) => row.investment > 0);
  const firstInvestment = periods[firstInvestmentIndex];
  const previous = periods[firstInvestmentIndex - 1];
  const initialPoint = firstInvestment ? {
    period: `${firstInvestment.period} · capital`, day: firstInvestment.period,
    stage: 'Capital engagé', investment: firstInvestment.cumulativeInvestment,
    revenue: 0, charges: 0, margin: 0,
    balance: (previous?.cumulativeContribution || 0) - firstInvestment.cumulativeInvestment,
  } : null;
  let firstPaybackDate = null;
  let previousBalance = initialPoint?.balance ?? null;
  const series = [];
  periods.forEach((row, index) => {
    if (index === firstInvestmentIndex && initialPoint && (!from || initialPoint.day >= from) && (!to || initialPoint.day <= to)) {
      series.push(initialPoint);
    }
    const balance = row.cumulativeContribution - row.cumulativeInvestment;
    if (row.cumulativeInvestment > 0 && previousBalance != null && previousBalance < 0 && balance >= 0 && !firstPaybackDate) {
      firstPaybackDate = row.period;
    }
    previousBalance = balance;
    if ((!from || row.period >= from) && (!to || row.period <= to)) {
      series.push({ period: row.period, day: row.period, stage: 'Fin de journée',
        investment: row.cumulativeInvestment, revenue: row.contribution + row.charges,
        charges: row.charges, margin: row.contribution, balance });
    }
  });
  return { series, firstPaybackDate, totals: report.totals };
};

export const mobiObservedProjection = (entries, today, windowDays = 30) => {
  const start = addDays(today, 1 - windowDays);
  const byDay = new Map();
  for (const entry of entries) {
    const rate = amount(entry.config?.tauxContribution) / 100;
    for (const row of entry.daily || []) {
      if (row.day < start || row.day > today) continue;
      if (!byDay.has(row.day)) byDay.set(row.day, { margin: 0, known: true });
      const target = byDay.get(row.day);
      target.margin += amount(row.caNet) * rate - amount(row.charges);
      if (row.caKnown === false) target.known = false;
    }
  }
  const observed = [...byDay.values()].filter((row) => row.known);
  const average = observed.length ? observed.reduce((sum, row) => sum + row.margin, 0) / observed.length : null;
  const investment = entries.reduce((sum, entry) => sum + amount(entry.summary?.investment), 0);
  const contribution = entries.reduce((sum, entry) => sum + amount(entry.summary?.contribution), 0);
  const remaining = Math.max(0, investment - contribution);
  const projectedDays = investment > 0 && remaining > 0 && average > 0 ? Math.ceil(remaining / average) : null;
  return { average, observedDays: observed.length, totalDays: byDay.size, remaining, projectedDays,
    projectionDate: projectedDays != null && projectedDays <= 36500 ? addDays(today, projectedDays) : null };
};

export const mobiDeploymentRows = (terminaux, points, agences) => {
  const agenciesByCode = new Map(agences.filter((agency) => String(agency.codePDV || '').trim())
    .map((agency) => [String(agency.codePDV).trim(), agency]));
  const agenciesByName = new Map(agences.filter((agency) => String(agency.nom || '').trim())
    .map((agency) => [String(agency.nom).trim().toLowerCase(), agency]));
  const activeByTerminal = new Map();
  for (const point of points) {
    if (point.statut !== 'Actif' || !point.terminalReference) continue;
    const previous = activeByTerminal.get(point.terminalReference);
    if (!previous || String(point.dateDebutValidite || '') > String(previous.dateDebutValidite || '')) {
      activeByTerminal.set(point.terminalReference, point);
    }
  }
  return terminaux.filter((terminal) => terminal.reference).map((terminal) => {
    const point = activeByTerminal.get(terminal.reference);
    const agency = point && (agenciesByCode.get(String(point.agenceCodePDV || '').trim())
      || agenciesByName.get(String(point.agenceNom || '').trim().toLowerCase()));
    return {
      reference: terminal.reference,
      modele: terminal.modele || 'Mobi',
      statut: terminal.statut,
      region: agency?.region || point?.region || '',
      secteur: agency?.secteur || '',
      agence: agency?.nom || point?.agenceNom || '',
      guichetiere: point?.guichetiereNom || '',
      matricule: String(point?.guichetiereMatricule || '').trim(),
    };
  });
};

export const mobiParkRows = (terminaux, resultsByTerminal, sort = 'reference', deployments = []) => {
  const deploymentByReference = new Map(deployments.map((row) => [row.reference, row]));
  const rows = terminaux.map((terminal) => {
    const entry = resultsByTerminal[terminal.reference];
    if (!entry) return null;
    const deployment = deploymentByReference.get(terminal.reference);
    const current = entry.grouped.at(-1);
    const objective = current?.objectifVerse > 0 ? current.objectifVerse : current?.objectifCaNet || 0;
    const verseKnown = (current?.verseKnownDays || 0) > 0;
    const investment = amount(entry.summary.investment);
    const margin = amount(entry.summary.contribution);
    const balance = margin - investment;
    const caKnown = entry.daily?.some((row) => row.caKnown !== false) ?? false;
    const reliable = investment > 0 && Boolean(entry.serviceDate) && caKnown && !entry.partialCa
      && Number(entry.config?.tauxContribution) > 0;
    return {
      reference: terminal.reference,
      modele: terminal.modele || 'Mobi',
      statut: terminal.statut || '',
      vendeur: deployment?.guichetiere || '',
      agence: deployment?.agence || '',
      region: deployment?.region || '',
      serviceDate: entry.serviceDate || '',
      investment,
      caNet: entry.summary.caNet,
      mtVerse: current?.mtVerse || 0,
      objective,
      objectiveMetric: current?.objectifVerse > 0 ? 'MT versé' : objective > 0 ? 'CA net' : '',
      verseKnown,
      charges: entry.summary.charges,
      remaining: Math.max(0, entry.summary.remaining),
      margin,
      balance,
      recoveryPercent: investment > 0 ? margin / investment * 100 : null,
      paybackDate: entry.summary.actualPaybackDate || '',
      projectionDate: entry.summary.projectionDate || '',
      financialStatus: !reliable ? 'Données insuffisantes' : balance >= 0 ? 'Récupéré' : margin < 0 ? 'Déficitaire' : 'En cours',
      gap: objective > 0 && verseKnown ? (current.mtVerse - objective) / objective * 100 : null,
      partial: entry.partialCa || entry.partialVerse,
    };
  }).filter(Boolean);
  return rows.sort((a, b) => {
    if (sort === 'gap') {
      if (a.gap == null || b.gap == null) return a.gap == null && b.gap == null
        ? a.reference.localeCompare(b.reference, 'fr') : a.gap == null ? 1 : -1;
      return a.gap - b.gap || a.reference.localeCompare(b.reference, 'fr');
    }
    const key = { remaining: 'remaining', caNet: 'caNet', investment: 'investment', margin: 'margin', recovery: 'recoveryPercent' }[sort];
    if (key === 'recoveryPercent' && (a[key] == null || b[key] == null)) {
      return a[key] == null && b[key] == null ? a.reference.localeCompare(b.reference, 'fr') : a[key] == null ? 1 : -1;
    }
    return key ? b[key] - a[key] || a.reference.localeCompare(b.reference, 'fr')
      : a.reference.localeCompare(b.reference, 'fr');
  });
};

export const calculateMobiSummary = (daily, config, today, inactiveDays = 0) => {
  const sum = (key) => daily.reduce((total, row) => total + row[key], 0);
  const investment = Array.isArray(config.investissements)
    ? config.investissements.filter((item) => !item.date || item.date <= today)
      .reduce((total, item) => total + amount(item.montant), 0)
    : legacyInvestments.reduce((total, [key]) => total + amount(config[key]), 0);
  const caNet = sum('caNet');
  const mtVerse = sum('mtVerse');
  const charges = sum('charges');
  const marginRate = amount(config.tauxContribution) / 100;
  const contribution = caNet * marginRate - charges;
  const remaining = investment - contribution;
  const nextDay = addDays(today, 1);
  const futureDailyCharges = (config.charges || [])
    .filter((charge) => charge.frequence !== 'ponctuelle')
    .reduce((total, charge) => total + chargeForDay(charge, nextDay, objectiveForDay(config, 'ca_net', nextDay)), 0);
  const dailyTargetContribution = objectiveForDay(config, 'ca_net', nextDay) * marginRate
    - futureDailyCharges;
  const projectedDays = investment > 0 && marginRate > 0 && dailyTargetContribution > 0 && remaining > 0
    ? Math.ceil(remaining / dailyTargetContribution) : null;
  const projectionDate = investment > 0 && remaining <= 0 && marginRate > 0 ? today
    : projectedDays != null && projectedDays <= 36500 ? addDays(today, projectedDays) : null;
  const inactiveStart = inactiveDays > 0 ? addDays(today, 1 - inactiveDays) : null;
  const inactivityLoss = inactiveStart
    ? daily.filter((row) => row.day >= inactiveStart)
      .reduce((total, row) => total + Math.max(0,
        (row.objectifVerse > 0 ? row.objectifVerse : row.objectifCaNet) - row.mtVerse), 0) : null;
  let actualPaybackDate = null;
  let running = 0;
  const lastInvestmentDate = Array.isArray(config.investissements)
    ? config.investissements.filter((item) => !item.date || item.date <= today)
      .map((item) => item.date || '0000-01-01').sort().at(-1) : null;
  if (investment > 0 && marginRate > 0) {
    for (const row of daily) {
      running += row.caNet * marginRate - row.charges;
      if ((!lastInvestmentDate || row.day >= lastInvestmentDate) && running >= investment) { actualPaybackDate = row.day; break; }
    }
  }
  return { investment, caNet, mtVerse, charges, contribution, remaining, projectedDays,
    projectionDate, actualPaybackDate, inactivityLoss, objectifCaNet: sum('objectifCaNet'), objectifVerse: sum('objectifVerse') };
};
