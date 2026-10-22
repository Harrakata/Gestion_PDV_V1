import { chargeForDay, mobiVariableChargeRateForDay } from './mobiRentabilite.js';

const numberValue = (value) => Number(value) || 0;
const dayKey = (value) => String(value || '').slice(0, 10);
const addDays = (day, count) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

export const mobiFilterOptions = (deployments = [], filters = {}, key, allValue = '__all__') => {
  const order = ['region', 'secteur', 'agence', 'pointVente', 'guichetiere', 'terminal'];
  const position = order.indexOf(key);
  return [...new Set(deployments.filter((row) => order.slice(0, Math.max(0, position)).every((field) =>
    filters[field] === allValue || (field === 'terminal' ? row.reference : row[field]) === filters[field]))
    .map((row) => key === 'terminal' ? row.reference : row[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr'));
};

const normalizeSummary = (row) => ({
  reference: String(row.id_trm_mobi || '').trim(),
  firstDate: row.premiere_date_periode || '',
  lastDate: row.derniere_date_periode || '',
  latestDate: row.date_dernier_etat || '',
  reportedDays: numberValue(row.jours_remontes),
  activeDays: numberValue(row.jours_avec_enjeux),
  periodStakes: numberValue(row.enjeux_periode),
  cumulativeStakes: numberValue(row.cumul_enjeux),
  latestDailyStakes: numberValue(row.dernier_enjeux_jour),
  periodGain: numberValue(row.gain_periode),
  periodCancellation: numberValue(row.annulation_periode),
});

const normalizeSeries = (row) => ({
  period: row.periode || '',
  periodStakes: numberValue(row.enjeux_jour),
  cumulativeStakes: numberValue(row.cumul_enjeux),
  terminalCount: numberValue(row.terminaux),
  dayCount: numberValue(row.jours),
});

const chunkValues = (values, size = 100) => Array.from(
  { length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size),
);

const mapConcurrent = async (values, concurrency, callback) => {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await callback(values[index], index);
    }
  }));
  return results;
};

const fetchRpc = async (client, functionName, parameters) => {
  const { data, error } = await client.rpc(functionName, parameters);
  if (error) throw error;
  return data || [];
};

const fetchChunkWithTimeoutSplit = async (client, functionName, parameters, references) => {
  try {
    return await fetchRpc(client, functionName, { ...parameters, p_terminal_references: references });
  } catch (error) {
    const timedOut = error?.code === '57014' || String(error?.message || '').includes('statement timeout');
    if (!timedOut || !references || references.length <= 10) throw error;
    const middle = Math.ceil(references.length / 2);
    const first = await fetchChunkWithTimeoutSplit(client, functionName, parameters, references.slice(0, middle));
    const second = await fetchChunkWithTimeoutSplit(client, functionName, parameters, references.slice(middle));
    return [...first, ...second];
  }
};

export const fetchMobiEnjeuxSummaries = async (client, {
  references = null, dateFrom = null, dateTo = null,
} = {}) => {
  const chunks = references?.length ? chunkValues(references) : [null];
  const pages = await mapConcurrent(chunks, 2, (chunk) => fetchChunkWithTimeoutSplit(client,
    'get_mobi_enjeux_terminal_summary_v2', {
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
    }, chunk));
  return pages.flat().map(normalizeSummary);
};

export const fetchMobiEnjeuxSeries = async (client, {
  references = null, dateFrom = null, dateTo = null, granularity = 'mois',
} = {}) => {
  const chunks = references?.length ? chunkValues(references) : [null];
  const pages = await mapConcurrent(chunks, 2, (chunk) => fetchChunkWithTimeoutSplit(client,
    'get_mobi_enjeux_series_v2', {
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_granularity: granularity,
    }, chunk));
  return mergeMobiSeriesPages(pages.map((page) => page.map(normalizeSeries)));
};

export const fetchMobiEnjeuxDailyCurve = async (client, {
  references = null, dateFrom = null, dateTo = null,
} = {}) => {
  const chunks = references?.length ? chunkValues(references) : [null];
  const pages = await mapConcurrent(chunks, 2, (chunk) => fetchChunkWithTimeoutSplit(client,
    'get_mobi_enjeux_daily_curve_v2', {
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
    }, chunk));
  return expandMobiDailySeries(
    mergeMobiSeriesPages(pages.map((page) => page.map(normalizeSeries))),
    dateFrom,
    dateTo,
  );
};

export const expandMobiDailySeries = (rows = [], dateFrom = null, dateTo = null) => {
  const start = dateFrom || rows[0]?.period;
  const end = dateTo || rows.at(-1)?.period;
  if (!start || !end || start > end) return [];
  const byDay = new Map(rows.map((row) => [row.period, row]));
  const expanded = [];
  let cumulativeStakes = 0;
  for (let day = start, guard = 0; day <= end && guard < 10000; day = addDays(day, 1), guard += 1) {
    const row = byDay.get(day);
    if (row) cumulativeStakes = numberValue(row.cumulativeStakes);
    expanded.push(row ? { ...row, dayCount: 1 } : {
      period: day,
      periodStakes: 0,
      cumulativeStakes,
      terminalCount: 0,
      dayCount: 1,
    });
  }
  return expanded;
};

const trendPeriodKey = (day, granularity) => {
  const value = dayKey(day);
  if (!value || granularity === 'jour') return value;
  if (granularity === 'mois') return `${value.slice(0, 7)}-01`;
  if (granularity === 'annee') return `${value.slice(0, 4)}-01-01`;
  const date = new Date(`${value}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
};

export const groupMobiTrendSeries = (rows = [], granularity = 'jour') => {
  if (granularity === 'jour') return rows;
  const periods = new Map();
  for (const row of rows) {
    const period = trendPeriodKey(row.period, granularity);
    if (!periods.has(period)) periods.set(period, {
      period, periodStakes: 0, cumulativeStakes: 0, terminalCount: 0, dayCount: 0,
    });
    const target = periods.get(period);
    target.periodStakes += numberValue(row.periodStakes);
    target.cumulativeStakes = numberValue(row.cumulativeStakes);
    target.terminalCount = Math.max(target.terminalCount, numberValue(row.terminalCount));
    target.dayCount += numberValue(row.dayCount) || 1;
  }
  return [...periods.values()];
};

export const mergeMobiSeriesPages = (pages = []) => {
  const allPeriods = [...new Set(pages.flatMap((page) => page.map((row) => row.period)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const periods = new Map(allPeriods.map((period) => [period, {
    period, periodStakes: 0, cumulativeStakes: 0, terminalCount: 0, dayCount: 0,
  }]));
  for (const page of pages) {
    const byPeriod = new Map(page.map((row) => [row.period, row]));
    let lastCumulative = null;
    for (const periodKey of allPeriods) {
      const row = byPeriod.get(periodKey);
      if (row) lastCumulative = numberValue(row.cumulativeStakes);
      if (!row && lastCumulative == null) continue;
      const total = periods.get(periodKey);
      total.periodStakes += numberValue(row?.periodStakes);
      total.cumulativeStakes += row ? numberValue(row.cumulativeStakes) : lastCumulative;
      total.terminalCount += numberValue(row?.terminalCount);
      total.dayCount = Math.max(total.dayCount, numberValue(row?.dayCount));
    }
  }
  return [...periods.values()];
};

export const mobiPeriodEnd = (period, granularity) => {
  const date = new Date(`${period}T00:00:00Z`);
  if (granularity === 'semaine') date.setUTCDate(date.getUTCDate() + 6);
  else if (granularity === 'mois') {
    date.setUTCMonth(date.getUTCMonth() + 1, 1);
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (granularity === 'annee') date.setUTCMonth(11, 31);
  return date.toISOString().slice(0, 10);
};

const boundedPeriod = (period, granularity, dateFrom = '', dateTo = '') => ({
  start: dateFrom && dateFrom > period ? dateFrom : period,
  end: dateTo && dateTo < mobiPeriodEnd(period, granularity) ? dateTo : mobiPeriodEnd(period, granularity),
});

const averageVariableChargeRateInRange = (charges, start, end) => {
  if (!start || !end || start > end) return 0;
  let total = 0;
  let days = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    total += mobiVariableChargeRateForDay(charges, day);
    days += 1;
  }
  return days ? total / days : 0;
};

const averageVariableChargeRate = (charges, period, granularity, dateFrom = '', dateTo = '') => {
  const { start, end } = boundedPeriod(period, granularity, dateFrom, dateTo);
  return averageVariableChargeRateInRange(charges, start, end);
};

export const mergeMobiContributionSeries = (seriesByRate = [], {
  granularity = 'mois', dateFrom = '', dateTo = '',
} = {}) => {
  const allPeriods = [...new Set(seriesByRate.flatMap((group) =>
    (group.series || []).map((row) => row.period)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const periods = new Map();
  for (const group of seriesByRate) {
    const byPeriod = new Map((group.series || []).map((row) => [row.period, row]));
    const rate = numberValue(group.rate);
    let lastCumulative = null;
    for (const periodKey of allPeriods) {
      const row = byPeriod.get(periodKey);
      if (row) lastCumulative = numberValue(row.cumulativeStakes);
      if (!row && lastCumulative == null) continue;
      if (!periods.has(periodKey)) periods.set(periodKey, {
        period: periodKey, periodStakes: 0, cumulativeStakes: 0,
        periodContribution: 0, cumulativeContribution: 0, periodVariableCharges: 0,
        terminalCount: 0, dayCount: 0,
      });
      const period = periods.get(periodKey);
      const chargeRate = averageVariableChargeRate(group.variableCharges || [], periodKey,
        granularity, dateFrom, dateTo);
      const periodStakes = numberValue(row?.periodStakes);
      const cumulativeStakes = row ? numberValue(row.cumulativeStakes) : lastCumulative;
      const periodContribution = periodStakes * rate / 100;
      const periodVariableCharges = periodContribution * chargeRate;
      period.periodStakes += periodStakes;
      period.cumulativeStakes += cumulativeStakes;
      period.periodContribution += periodContribution;
      period.periodVariableCharges += periodVariableCharges;
      period.terminalCount += numberValue(row?.terminalCount);
      period.dayCount = Math.max(period.dayCount, numberValue(row?.dayCount));
    }
  }
  let cumulativeContribution = 0;
  return [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)).map((period) => {
    cumulativeContribution += period.periodContribution;
    return { ...period, cumulativeContribution };
  });
};

export const mobiEnjeuxInvestmentEntries = ({ config, deployments = [], references = [],
  allocateConfig = null } = {}) => {
  if (!config || !allocateConfig) return [];
  return deployments.flatMap((terminal) => {
    const effective = allocateConfig(config, terminal, references);
    return (effective.investissements || []).map((item) => ({
      date: String(item.date || effective.dateMiseEnService || '0000-01-01').slice(0, 10),
      amount: numberValue(item.montant),
      reference: terminal.reference,
      label: item.libelle || 'Investissement',
    }));
  }).filter((item) => item.amount > 0);
};

export const mobiEnjeuxFixedChargeEntries = ({ config, deployments = [], references = [],
  allocateConfig = null } = {}) => {
  if (!config || !allocateConfig) return [];
  return deployments.flatMap((terminal) => {
    const effective = allocateConfig(config, terminal, references);
    return (effective.charges || []).filter((item) => item.typeMontant !== 'pourcentage_ca')
      .map((item) => ({ ...item, reference: terminal.reference }));
  });
};

const fixedChargesInRange = (charges, start, end) => {
  if (!start || !end || start > end) return 0;
  let total = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    total += charges.reduce((sum, charge) => sum + chargeForDay(charge, day), 0);
  }
  return total;
};

const fixedChargesInPeriod = (charges, period, granularity, dateFrom = '', dateTo = '') => {
  const { start, end } = boundedPeriod(period, granularity, dateFrom, dateTo);
  return fixedChargesInRange(charges, start, end);
};

const nextPeriod = (period, granularity) => {
  const date = new Date(`${period}T00:00:00Z`);
  if (granularity === 'jour') date.setUTCDate(date.getUTCDate() + 1);
  else if (granularity === 'semaine') date.setUTCDate(date.getUTCDate() + 7);
  else if (granularity === 'annee') date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 1);
  else date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
};

export const buildMobiProfitabilityCurve = ({ series = [], investments = [], granularity = 'mois',
  fixedCharges = [], calculationFrom = '', dateTo = '', averageWindow = 3, projectionPeriods = 36 } = {}) => {
  const investmentAt = (day) => investments.filter((item) => !item.date || item.date <= day)
    .reduce((total, item) => total + numberValue(item.amount), 0);
  let cumulativeCharges = 0;
  let cumulativeContribution = 0;
  const actual = series.map((row) => {
    const periodFixedCharges = fixedChargesInPeriod(fixedCharges, row.period, granularity,
      calculationFrom, dateTo);
    const periodCharges = numberValue(row.periodVariableCharges) + periodFixedCharges;
    cumulativeCharges += periodCharges;
    cumulativeContribution += numberValue(row.periodContribution);
    const cumulativeNetContribution = cumulativeContribution - cumulativeCharges;
    const investment = investmentAt(mobiPeriodEnd(row.period, granularity));
    const balance = cumulativeNetContribution - investment;
    return { ...row, cumulativeContribution, periodFixedCharges, periodCharges, cumulativeCharges,
      periodNetContribution: numberValue(row.periodContribution) - periodCharges,
      cumulativeNetContribution, investment, balance, projectionBalance: null, projected: false };
  });
  const last = actual.at(-1);
  if (!last) return { rows: [], currentBalance: 0, recoveryPercent: null,
    actualPaybackDate: '', projectedPaybackDate: '', averageContribution: 0, cumulativeCharges: 0 };

  const payback = actual.find((row) => row.investment > 0 && row.balance >= 0);
  const observed = actual.slice(-Math.max(1, Number(averageWindow) || 3))
    .map((row) => numberValue(row.periodNetContribution));
  const averageContribution = observed.length
    ? observed.reduce((total, value) => total + value, 0) / observed.length : 0;
  const rows = [...actual];
  let projectedPaybackDate = '';
  if (last.balance < 0 && averageContribution > 0) {
    rows[rows.length - 1] = { ...last, projectionBalance: last.balance };
    let period = last.period;
    let contribution = numberValue(last.cumulativeNetContribution);
    for (let index = 0; index < projectionPeriods; index += 1) {
      period = nextPeriod(period, granularity);
      contribution += averageContribution;
      const investment = investmentAt(mobiPeriodEnd(period, granularity));
      const projectionBalance = contribution - investment;
      rows.push({ period, periodStakes: null, cumulativeStakes: null, periodContribution: null,
        cumulativeContribution: null, periodCharges: null, cumulativeCharges: null,
        cumulativeNetContribution: contribution, investment, balance: null,
        projectionBalance, projected: true });
      if (projectionBalance >= 0) {
        projectedPaybackDate = mobiPeriodEnd(period, granularity);
        break;
      }
    }
  }
  return {
    rows,
    currentBalance: last.balance,
    recoveryPercent: last.investment > 0 ? numberValue(last.cumulativeNetContribution) / last.investment * 100 : null,
    actualPaybackDate: payback ? mobiPeriodEnd(payback.period, granularity) : '',
    projectedPaybackDate,
    averageContribution,
    cumulativeCharges: last.cumulativeCharges,
    currentNetContribution: last.cumulativeNetContribution,
  };
};

export const mobiEnjeuxInvestment = (config, terminal, references, dateTo, allocateConfig) => {
  if (!config || !allocateConfig) return 0;
  const effective = allocateConfig(config, terminal, references);
  return (effective.investissements || [])
    .filter((item) => !item.date || !dateTo || String(item.date).slice(0, 10) <= dateTo)
    .reduce((total, item) => total + numberValue(item.montant), 0);
};

export const buildMobiEnjeuxRows = ({ deployments = [], summaries = [], config = null,
  references = [], dateFrom = '', dateTo = '', allocateConfig = null } = {}) => {
  const summaryByReference = new Map(summaries.map((row) => [row.reference, row]));
  return deployments.map((deployment) => {
    const summary = summaryByReference.get(deployment.reference);
    const effective = config && allocateConfig
      ? allocateConfig(config, deployment, references) : null;
    const contributionRate = numberValue(effective?.tauxContribution);
    const investment = mobiEnjeuxInvestment(config, deployment, references, dateTo, allocateConfig);
    const periodStakes = summary?.periodStakes || 0;
    const cumulativeStakes = summary?.cumulativeStakes || 0;
    const cumulativeContribution = periodStakes * contributionRate / 100;
    const chargeStart = dateFrom || (effective?.charges || []).map((item) => dayKey(item.dateDebut))
      .filter(Boolean).sort()[0] || summary?.firstDate || '';
    const chargeEnd = dateTo || summary?.lastDate || '';
    const variableRate = chargeStart && chargeEnd
      ? averageVariableChargeRateInRange((effective?.charges || []).filter((item) => item.typeMontant === 'pourcentage_ca'),
        chargeStart, chargeEnd) : 0;
    const fixedCharges = chargeStart && chargeEnd
      ? fixedChargesInRange((effective?.charges || []).filter((item) => item.typeMontant !== 'pourcentage_ca'),
        chargeStart, chargeEnd) : 0;
    const periodContribution = periodStakes * contributionRate / 100;
    const periodCharges = periodContribution * variableRate + fixedCharges;
    return {
      ...deployment,
      hasReport: Boolean(summary),
      firstDate: summary?.firstDate || '',
      lastDate: summary?.lastDate || '',
      latestDate: summary?.latestDate || '',
      reportedDays: summary?.reportedDays || 0,
      activeDays: summary?.activeDays || 0,
      periodStakes,
      cumulativeStakes,
      latestDailyStakes: summary?.latestDailyStakes || 0,
      periodGain: summary?.periodGain || 0,
      periodCancellation: summary?.periodCancellation || 0,
      contributionRate,
      periodContribution,
      periodCharges,
      periodNetContribution: periodContribution - periodCharges,
      cumulativeContribution,
      investment,
      grossBalance: cumulativeContribution - investment,
    };
  });
};

const GROUP_FIELDS = {
  terminal: ['reference', 'reference'],
  pointVente: ['pointVente', 'Point de vente non affecté'],
  agence: ['agence', 'Agence non affectée'],
  region: ['region', 'Région non renseignée'],
  secteur: ['secteur', 'Secteur non renseigné'],
  guichetiere: ['guichetiere', 'Guichetière non affectée'],
};

export const groupMobiEnjeuxRows = (rows = [], dimension = 'pointVente') => {
  const [field, fallback] = GROUP_FIELDS[dimension] || GROUP_FIELDS.pointVente;
  const groups = new Map();
  for (const row of rows) {
    const key = String(row[field] || '').trim() || fallback;
    if (!groups.has(key)) groups.set(key, { key, label: key, terminalCount: 0, reportedTerminals: 0,
      periodStakes: 0, cumulativeStakes: 0, periodContribution: 0,
      periodCharges: 0, periodNetContribution: 0, cumulativeContribution: 0,
      investment: 0, grossBalance: 0, lastDate: '' });
    const group = groups.get(key);
    group.terminalCount += 1;
    group.reportedTerminals += row.hasReport ? 1 : 0;
    for (const metric of ['periodStakes', 'cumulativeStakes', 'periodContribution', 'periodCharges', 'periodNetContribution',
      'cumulativeContribution', 'investment', 'grossBalance']) group[metric] += numberValue(row[metric]);
    if (row.latestDate > group.lastDate) group.lastDate = row.latestDate;
  }
  return [...groups.values()].sort((a, b) => b.periodStakes - a.periodStakes || a.label.localeCompare(b.label, 'fr'));
};

export const summarizeMobiEnjeuxRows = (rows = []) => rows.reduce((totals, row) => ({
  terminalCount: totals.terminalCount + 1,
  reportedTerminals: totals.reportedTerminals + (row.hasReport ? 1 : 0),
  periodStakes: totals.periodStakes + numberValue(row.periodStakes),
  cumulativeStakes: totals.cumulativeStakes + numberValue(row.cumulativeStakes),
  periodContribution: totals.periodContribution + numberValue(row.periodContribution),
  periodCharges: totals.periodCharges + numberValue(row.periodCharges),
  periodNetContribution: totals.periodNetContribution + numberValue(row.periodNetContribution),
  cumulativeContribution: totals.cumulativeContribution + numberValue(row.cumulativeContribution),
  investment: totals.investment + numberValue(row.investment),
  grossBalance: totals.grossBalance + numberValue(row.grossBalance),
}), { terminalCount: 0, reportedTerminals: 0, periodStakes: 0, cumulativeStakes: 0,
  periodContribution: 0, periodCharges: 0, periodNetContribution: 0,
  cumulativeContribution: 0, investment: 0, grossBalance: 0 });
