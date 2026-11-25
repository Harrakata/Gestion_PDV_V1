// Lectures de la cloche de notifications. Le client est fourni par l'appelant (celui de l'espace).
//
// Une panne passagère (réseau, serveur, jeton expiré) lève une erreur : l'appelant garde la
// dernière valeur connue. Un refus durable (table ou droit absent) vaut « rien à signaler ».
const isTransient = ({ status }) => !status || status === 401 || status === 408 || status === 429 || status >= 500;

const read = async (query) => {
  const result = await query;
  if (!result.error) return result;
  if (isTransient(result)) throw result.error;
  return { data: [], count: 0 };
};

const isEmpty = (value) => value === undefined || value === null || value === '';
const ACTIVE_TICKETS = ['ouvert', 'en_cours'];
const TICKETS_LIMIT = 1000;

export const createNotificationsRepository = (client, { now = () => Date.now() } = {}) => {
  const geoByAgence = new Map();

  const withFilters = (query, filters) => filters.reduce((current, [column, value]) => (
    Array.isArray(value) ? current.in(column, value) : current.eq(column, value)
  ), query);
  // Un filtre de périmètre vide (contexte pas encore connu) ne lit rien, au lieu de tout lire.
  const isOutOfScope = (filters) => filters.some(([, value]) => isEmpty(value));

  const countRows = async (table, filters = []) => {
    if (isOutOfScope(filters)) return 0;
    const { count } = await read(withFilters(client.from(table).select('id', { count: 'exact', head: true }), filters));
    return count || 0;
  };

  const fetchGeo = async (agenceNom) => {
    if (!agenceNom) return {};
    if (!geoByAgence.has(agenceNom)) {
      const { data } = await read(client.from('agences').select('region, secteur').eq('nom', agenceNom).eq('is_current', true).limit(1));
      geoByAgence.set(agenceNom, data?.[0] || {});
    }
    return geoByAgence.get(agenceNom);
  };

  return {
    countRows,

    /** Demandes en attente, les plus récentes d'abord. */
    async fetchDemandes(table, filters) {
      if (isOutOfScope(filters)) return [];
      const { data } = await read(withFilters(client.from(table).select('*'), filters).order('created_at', { ascending: false }).limit(50));
      return data || [];
    },

    /** Enregistrements refusés (hors zone) que l'intéressé n'a pas encore vus. */
    async countRefused(table, column, value) {
      if (isEmpty(value)) return 0;
      const { count } = await read(client.from(table).select('id', { count: 'exact', head: true })
        .eq(column, value).eq('geo_refused', true).not('geo_refusal_ack', 'is', true));
      return count || 0;
    },

    async countActiveTickets(filters) {
      if (isOutOfScope(filters)) return 0;
      const query = client.from('tickets_incidents').select('id', { count: 'exact', head: true }).in('statut', ACTIVE_TICKETS);
      const { count } = await read(withFilters(query, filters));
      return count || 0;
    },

    /** Tickets ouverts et tickets en retard, en une seule lecture. */
    async fetchTicketSummary(isOverdue) {
      const { data, count } = await read(client.from('tickets_incidents')
        .select('priorite, statut, created_at', { count: 'exact' })
        .in('statut', ACTIVE_TICKETS)
        .order('created_at', { ascending: true })
        .limit(TICKETS_LIMIT));
      const rows = data || [];
      const truncated = (count || 0) > rows.length;
      return {
        open: truncated ? await countRows('tickets_incidents', [['statut', 'ouvert']]) : rows.filter((row) => row.statut === 'ouvert').length,
        overdue: rows.filter(isOverdue).length,
      };
    },

    /** Remontées terrain non traitées. */
    countRemontees: (destinataire) => countRows('messages_exploitation', [['destinataires', destinataire], ['actif', true]]),

    /** Écritures hors-ligne en attente, par appareil. */
    async fetchPendingDevices() {
      const { data } = await read(client.from('sync_health').select('agence_nom, pending_count, oldest_pending_at').gt('pending_count', 0));
      return data || [];
    },

    /** Messages de l'exploitation en cours de validité. */
    async fetchMessages() {
      const time = now();
      // Heure arrondie : l'adresse de la requête reste stable (une seule vérification CORS par
      // heure au lieu d'une par appel). La date d'expiration exacte est vérifiée ci-dessous.
      const hour = new Date(Math.floor(time / 3600000) * 3600000).toISOString();
      const { data } = await read(client.from('messages_exploitation')
        .select('id, titre, corps, categorie, destinataires, agence_nom, region_nom, secteur_nom, guichetiere_matricules, technicien_ids, envoye_par_nom, created_at, expire_a')
        .eq('actif', true)
        .or(`expire_a.is.null,expire_a.gt.${hour}`)
        .order('created_at', { ascending: false })
        .limit(50));
      return (data || []).filter((row) => !row.expire_a || new Date(row.expire_a).getTime() > time);
    },

    fetchGeo,
  };
};
