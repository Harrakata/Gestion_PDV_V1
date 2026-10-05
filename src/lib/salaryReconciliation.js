export const normalizeSearch = (value) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const codeOf = (value) => String(value ?? '').trim();
const numberOf = (value) => Number(value) || 0;

// A server can impose a smaller page size than requested. Advance by the actual count.
export async function fetchReconciliationPages(createQuery) {
  const rows = [];
  while (true) {
    const { data, error } = await createQuery().range(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
  }
}

export function buildReconciliationRows(operations, payments, people, agencies) {
  const byCode = new Map();
  const aliases = new Map();
  people.forEach((person) => {
    const code = codeOf(person.codePrepose);
    if (code) byCode.set(code, person);
    const matricule = codeOf(person.matricule);
    if (matricule) {
      const matches = aliases.get(matricule) || new Set();
      if (code) matches.add(code);
      aliases.set(matricule, matches);
    }
  });
  // An explicit operator code always wins over a matricule belonging to someone else.
  const canonicalCode = (value) => {
    const code = codeOf(value);
    const matches = aliases.get(code);
    return !byCode.has(code) && matches?.size === 1 ? [...matches][0] : code;
  };
  const agencyIndex = new Map();
  agencies.forEach((agency) => {
    [agency.id, agency.nom, agency.codePDV].filter(Boolean).forEach((key) => {
      agencyIndex.set(normalizeSearch(key), agency);
    });
  });
  const rows = new Map();
  const getRow = (value) => {
    const code = canonicalCode(value);
    if (!code) return null;
    if (!rows.has(code)) {
      const person = byCode.get(code);
      const name = [person?.prenom, person?.nom].filter(Boolean).join(' ').trim();
      const agency = agencyIndex.get(normalizeSearch(person?.agenceAssigne));
      rows.set(code, {
        code, matricule: codeOf(person?.matricule), nom: name || 'Préposé non identifié',
        identified: Boolean(name), agence: agency?.nom || person?.agenceAssigne || '',
        region: agency?.region || '', secteur: agency?.secteur || '', codePDV: agency?.codePDV || '',
        mtEnr: 0, mtAnnule: 0, avance: 0, retrait: 0, mtVerse: 0,
        operationCount: 0, paymentCount: 0, lastPayment: '', lastOperation: '',
      });
    }
    return rows.get(code);
  };
  operations.forEach((operation) => {
    const row = getRow(operation.operateur);
    if (!row) return;
    row.mtEnr += numberOf(operation.mt_enr);
    row.mtAnnule += ['mt_anc', 'mt_ane', 'mt_anm', 'mt_ans'].reduce((sum, key) => sum + numberOf(operation[key]), 0);
    row.avance += numberOf(operation.m_avance);
    row.retrait += numberOf(operation.m_retrait);
    row.operationCount += 1;
    if (operation.date_op > row.lastOperation) row.lastOperation = operation.date_op;
  });
  payments.forEach((payment) => {
    const row = getRow(payment.guichetiere_code);
    if (!row) return;
    row.mtVerse += numberOf(payment.montant);
    row.paymentCount += 1;
    if (payment.date_versement > row.lastPayment) row.lastPayment = payment.date_versement;
  });
  return [...rows.values()].map((row) => {
    const soldeCaisse = row.mtEnr - row.mtAnnule + row.avance - row.retrait;
    const ecart = row.mtVerse - soldeCaisse;
    return { ...row, soldeCaisse, ecart, absEcart: Math.abs(ecart), status: ecart < 0 ? 'missing' : ecart > 0 ? 'surplus' : 'ok' };
  });
}

export const DEFAULT_RECONCILIATION_FILTERS = {
  search: '', match: 'all', status: 'gaps', agencies: [], regions: [], sectors: [],
  identity: 'all', source: 'all', min: '', max: '', sort: 'gap_desc',
};

export function filterReconciliationRows(rows, filters) {
  const f = { ...DEFAULT_RECONCILIATION_FILTERS, ...filters };
  const terms = (normalizeSearch(f.search).match(/"[^"]+"|\S+/g) || []).map((term) => term.replace(/^"|"$/g, ''));
  const filtered = rows.filter((row) => {
    if (f.status === 'gaps' && row.status === 'ok') return false;
    if (!['all', 'gaps'].includes(f.status) && row.status !== f.status) return false;
    if (f.agencies.length && !f.agencies.includes(row.agence)) return false;
    if (f.regions.length && !f.regions.includes(row.region)) return false;
    if (f.sectors.length && !f.sectors.includes(row.secteur)) return false;
    if (f.identity === 'unknown' && row.identified) return false;
    if (f.identity === 'known' && !row.identified) return false;
    if (f.source === 'no_payment' && row.paymentCount > 0) return false;
    if (f.source === 'no_operations' && row.operationCount > 0) return false;
    if (f.source === 'both' && (!row.operationCount || !row.paymentCount)) return false;
    if (f.min !== '' && row.absEcart < Number(f.min)) return false;
    if (f.max !== '' && row.absEcart > Number(f.max)) return false;
    const haystack = normalizeSearch([row.nom, row.code, row.matricule, row.agence, row.region, row.secteur, row.codePDV].join(' '));
    return !terms.length || (f.match === 'any' ? terms.some((term) => haystack.includes(term)) : terms.every((term) => haystack.includes(term)));
  });
  return filtered.sort((a, b) => {
    const byName = a.nom.localeCompare(b.nom, 'fr') || a.code.localeCompare(b.code, 'fr', { numeric: true });
    if (f.sort === 'name') return byName;
    if (f.sort === 'agency') return a.agence.localeCompare(b.agence, 'fr') || byName;
    if (f.sort === 'gap_asc') return a.absEcart - b.absEcart || byName;
    if (f.sort === 'due_desc') return b.soldeCaisse - a.soldeCaisse || byName;
    return b.absEcart - a.absEcart || byName;
  });
}

export function summarizeReconciliation(rows) {
  return rows.reduce((sum, row) => ({
    due: sum.due + row.soldeCaisse, paid: sum.paid + row.mtVerse, gap: sum.gap + row.ecart,
    missing: sum.missing + Math.max(0, -row.ecart), surplus: sum.surplus + Math.max(0, row.ecart),
    unknown: sum.unknown + Number(!row.identified),
  }), { due: 0, paid: 0, gap: 0, missing: 0, surplus: 0, unknown: 0 });
}
