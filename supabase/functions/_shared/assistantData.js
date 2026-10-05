import { validateLookup } from './assistantAccess.js';
import { normalizeAssistantText } from './assistantKnowledge.js';
import { buildTerminalMonitoringGroups } from '../../../src/lib/maintenanceMonitoring.js';

async function readBounded(createQuery, maximum = 1000) {
  const rows = [];
  while (rows.length < maximum) {
    const { data, error } = await createQuery().range(rows.length, Math.min(rows.length + 249, maximum - 1));
    if (error) throw new Error('La source demandée est indisponible ou non autorisée.');
    if (!data?.length) return { rows, truncated: false };
    rows.push(...data);
  }
  return { rows, truncated: true };
}

const matches = (values, query) => {
  const haystack = normalizeAssistantText(values.join(' '));
  return normalizeAssistantText(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
};

export async function lookupAssistantData(client, access, rawInput) {
  const input = validateLookup(rawInput);
  const { entity, query, status, limit } = input;
  const enabled = { agences: access.canReadAgencies, terminaux: access.canReadTerminals, terminaux_mobi: access.canReadMobi };
  if (!enabled[entity]) throw new Error('Votre profil ne permet pas de consulter cette source.');
  if (access.scope.kind !== 'all' && !access.scope.value) throw new Error('Aucun périmètre attribué à ce profil.');
  const consultedAt = new Date().toISOString();
  if (entity === 'terminaux_mobi') {
    const snapshot = await readBounded(() => client.from('terminaux_mobi').select('id, reference, modele, statut').order('id'));
    const rows = snapshot.rows.filter((row) => matches([row.reference, row.modele], query) && (!status || normalizeAssistantText(row.statut) === normalizeAssistantText(status)));
    return { entity, consultedAt, rows: rows.slice(0, limit), matchedInSnapshot: rows.length, truncated: snapshot.truncated,
      source: { title: 'Référentiel Terminaux Mobi', path: access.menus.find((menu) => menu.key === 'terminaux-mobi')?.path || null } };
  }
  const agencies = await readBounded(() => {
    let request = client.from('agences').select('id, nom, codePDV, region, secteur, nbreTerminaux').eq('is_current', true).order('id');
    if (access.scope.kind !== 'all') request = request.eq(access.scope.kind, access.scope.value);
    return request;
  });
  if (entity === 'agences') {
    if (status) throw new Error("Le référentiel agence n'a pas de statut d'ouverture temps réel. Consulter les terminaux pour l'état opérationnel.");
    const rows = agencies.rows.filter((row) => matches([row.nom, row.codePDV, row.region, row.secteur], query));
    return { entity, consultedAt, rows: rows.slice(0, limit), matchedInSnapshot: rows.length, truncated: agencies.truncated,
      note: 'Fiches courantes. nbreTerminaux est un nombre déclaré, pas un nombre de terminaux opérationnels.',
      source: { title: 'Référentiel Agences', path: access.menus.find((menu) => ['agences', 'maintenance-terminaux', 'maintenance'].includes(menu.key))?.path || null } };
  }
  const byId = Object.fromEntries(agencies.rows.map((agency) => [String(agency.id), agency]));
  // Scope is established from the authenticated profile, never from model arguments.
  const terminals = { rows: [], truncated: agencies.truncated };
  for (let i = 0; i < agencies.rows.length; i += 100) {
    const batch = await readBounded(() => client.from('terminaux')
      .select('id, agence_id, reference, type_terminal, statut, imprimante_reference, lecteur_reference, ecran_reference, afficheur_reference, buc_reference, carrosserie_reference')
      .in('agence_id', agencies.rows.slice(i, i + 100).map((agency) => agency.id)).order('id'), 1000 - terminals.rows.length);
    terminals.rows.push(...batch.rows);
    terminals.truncated ||= batch.truncated;
    if (terminals.rows.length >= 1000) { terminals.truncated = true; break; }
  }
  const matched = terminals.rows.filter((row) => {
    const agency = byId[String(row.agence_id)] || {};
    return matches([row.reference, row.type_terminal, agency.nom, agency.codePDV, agency.region, agency.secteur], query)
      && (!status || normalizeAssistantText(row.statut) === normalizeAssistantText(status));
  });
  const selected = matched.slice(0, limit);
  let interventions = { rows: [], truncated: false };
  let maintenanceUnavailable = false;
  if (selected.length) {
    try {
      interventions = await readBounded(() => client.from('interventions_maintenance')
        .select('id, terminal_id, type_intervention, sous_ensemble, statut, date_intervention, date_fin')
        .in('terminal_id', selected.map((terminal) => terminal.id)).order('date_intervention', { ascending: false }).order('id'));
    } catch { maintenanceUnavailable = true; }
  }
  const groups = buildTerminalMonitoringGroups(selected, interventions.rows, byId);
  return {
    entity, consultedAt, matchedInSnapshot: matched.length, truncated: terminals.truncated,
    note: 'Terminaux rattachés aux agences courantes accessibles. Les terminaux sans agence ne sont pas inclus.',
    rows: groups.map((group) => ({
      reference: group.terminalReference, agence: group.agenceNom, region: group.regionNom,
      statut: group.terminalStatus, type: group.terminalType,
      suivi: maintenanceUnavailable || interventions.truncated ? 'Suivi indisponible ou incomplet' : group.followUp.label,
      detailSuivi: maintenanceUnavailable || interventions.truncated ? null : group.followUp.detail,
      derniereIntervention: maintenanceUnavailable || interventions.truncated ? null : group.latestIntervention?.date_intervention || null,
    })),
    source: { title: 'Terminaux et suivi maintenance', path: access.menus.find((menu) => ['maintenance-terminaux', 'maintenance'].includes(menu.key))?.path || null },
  };
}
