// Destinataires d'une notification push : choix des abonnements (table push_subscriptions).
// Sans dépendance à Deno (testé par tests/unit/pushRecipients.test.js).
import { isForContext, isScoped, rolesOf } from '../../../src/features/notifications/messageAudience.js';

const PAGE = 1000;
const MAX_URL_VALUES = 50; // au-delà, filtré ici plutôt que dans l'adresse de la requête
const SUBSCRIPTION_COLUMNS = 'id, endpoint, p256dh, auth, user_id, role, agence_nom, region';
const FILTERS = ['role', 'agence_nom', 'region', 'user_id'];

// Page ouverte au clic sur un message, par rôle.
const ROLE_HOME = {
  guichetiere: '/espace-guichetiere',
  technicien: '/espace-technicien',
  chef_agence: '/espace-chef-agence',
  chef_secteur: '/espace-chef-secteur',
  directeur_regional: '/espace-validation-paiement-gain',
};

const readAll = async (client, table, columns, refine = (query) => query) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await refine(client.from(table).select(columns)).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
};

// ── Cible explicite { role?, agence_nom?, region?, user_id? } ────────────────
const isEmpty = (value) => value === undefined || value === null || value === '';

/** Critères d'une cible, ou null si elle ne désigne personne (jamais « tout le monde »). */
export const targetFilters = (target) => {
  const filters = FILTERS
    .filter((column) => !isEmpty(target?.[column]))
    .map((column) => [column, [target[column]].flat().map(String)]);
  return filters.length ? filters : null;
};

/** Abonnements répondant à tous les critères (chacun : une valeur ou une liste). */
export const findByTarget = async (client, target) => {
  const filters = targetFilters(target);
  if (!filters || filters.some(([, values]) => !values.length)) return [];
  const inQuery = filters.filter(([, values]) => values.length <= MAX_URL_VALUES);
  const rows = await readAll(client, 'push_subscriptions', SUBSCRIPTION_COLUMNS,
    (query) => inQuery.reduce((current, [column, values]) => current.in(column, values), query));
  return rows.filter((row) => filters.every(([column, values]) => values.includes(String(row[column]))));
};

// ── Message de l'exploitation ────────────────────────────────────────────────
const agencyResolver = (agences) => {
  const code = (value) => String(value || '').trim();
  const current = agences.filter((row) => row.is_current !== false);
  const byCode = new Map(current.filter((row) => code(row.codePDV)).map((row) => [code(row.codePDV), row]));
  const byName = new Map(current.map((row) => [row.nom, row]));
  // Agence renommée : la fiche de la personne peut porter l'ancien nom.
  const formerCode = new Map(agences.filter((row) => row.is_current === false).map((row) => [row.nom, code(row.codePDV)]));
  return (codePDV, nom) => byCode.get(code(codePDV)) || byName.get(nom) || byCode.get(formerCode.get(nom)) || null;
};

// Modifier une fiche peut créer une nouvelle ligne (historique) : l'abonnement porte alors
// l'identifiant de l'ancienne. La personne est retrouvée par son matricule.
const currentPeople = async (client, table, columns) => {
  const rows = await readAll(client, table, `id, matricule, is_current, ${columns}`);
  const current = new Map(rows.filter((row) => row.is_current !== false).map((row) => [row.matricule, row]));
  return new Map(rows.map((row) => [String(row.id), row.is_current !== false ? row : current.get(row.matricule)]));
};

const inAgency = (agency, nom) => ({ agenceNom: agency?.nom || nom, secteurNom: agency?.secteur, regionNom: agency?.region });

// Par rôle : (identifiant de l'abonné) → contexte, ou rien si la personne est inconnue.
const contextLoaders = {
  technicien: async () => (id) => ({ technicienId: id }),
  guichetiere: async (client, loadAgences) => {
    const people = await currentPeople(client, 'guichetieres', 'agenceAssigne');
    const agencyOf = agencyResolver(await loadAgences());
    return (id) => {
      const person = people.get(id);
      return person && { matricule: person.matricule, ...inAgency(agencyOf(null, person.agenceAssigne), person.agenceAssigne) };
    };
  },
  chef_agence: async (client, loadAgences) => {
    const people = await currentPeople(client, 'chefs_agence', 'agenceEnCharge, codePDV');
    const agencyOf = agencyResolver(await loadAgences());
    return (id) => {
      const person = people.get(id);
      return person && inAgency(agencyOf(person.codePDV, person.agenceEnCharge), person.agenceEnCharge);
    };
  },
  chef_secteur: async (client) => {
    const people = await currentPeople(client, 'chefs_secteur', 'secteurEnCharge');
    return (id) => people.get(id) && { secteurNom: people.get(id).secteurEnCharge };
  },
  directeur_regional: async (client) => {
    const rows = await readAll(client, 'validateurs_paiement_gain', 'id, regionAssignee');
    const people = new Map(rows.map((row) => [String(row.id), row]));
    return (id) => people.get(id) && { regionNom: people.get(id).regionAssignee };
  },
};

/**
 * Abonnements concernés par un message enregistré, avec ce qui leur est envoyé. Le texte et les
 * destinataires viennent de la base, pas de l'appelant.
 * @param roles rôles autorisés à recevoir (espaces dont les notifications sont actives), ou null
 * @returns {Promise<Array<{ subscription, payload }>>}
 */
export const findByMessage = async (client, messageId, roles = null) => {
  const { data: message, error } = await client.from('messages_exploitation')
    .select('id, titre, corps, destinataires, agence_nom, region_nom, secteur_nom, guichetiere_matricules, technicien_ids, actif')
    .eq('id', messageId).maybeSingle();
  if (error) throw error;
  if (!message || message.actif === false) return [];

  const wanted = rolesOf(message.destinataires).filter((role) => ROLE_HOME[role] && (!roles || roles.includes(role)));
  if (!wanted.length) return [];
  let recipients = await findByTarget(client, { role: wanted });

  if (isScoped(message) && recipients.length) {
    let agences = null;
    const loadAgences = () => {
      agences = agences || readAll(client, 'agences', 'id, nom, codePDV, region, secteur, is_current');
      return agences;
    };
    const contexts = {};
    for (const role of wanted) contexts[role] = await contextLoaders[role](client, loadAgences);
    recipients = recipients.filter((row) => {
      const context = row.user_id ? contexts[row.role](String(row.user_id)) : null;
      return Boolean(context) && isForContext(message, row.role, context);
    });
  }
  return recipients.map((subscription) => ({
    subscription,
    payload: { title: message.titre, body: message.corps || '', url: ROLE_HOME[subscription.role], openBell: true },
  }));
};
