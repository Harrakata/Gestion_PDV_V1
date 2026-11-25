import { MANAGED_SPACE_TABLES } from './profileModel.js';

// Le client est fourni par l'appelant pour garder les requêtes testables sans connexion réseau.
export const fetchProfilesAndTemplates = (client) => Promise.all([
  client.from('profils_exploitation').select('*').order('created_at', { ascending: false }),
  client.from('profil_utilisateur_templates').select('*').order('nom', { ascending: true }),
]);

export const fetchManagedSpaceUsers = async (spaces, client) => {
  const results = await Promise.all(spaces.map(async (space) => {
    const config = MANAGED_SPACE_TABLES[space.spaceKey];
    if (!config) return { spaceKey: space.spaceKey, data: [], error: null, config: null };

    let query = client.from(config.table).select(config.select).order(config.orderColumn, { ascending: true });
    if (config.currentFilter) {
      query = query.eq(config.currentFilter.column, config.currentFilter.value);
    }

    const { data, error } = await query;
    return { spaceKey: space.spaceKey, data: error ? [] : (data || []), error, config };
  }));

  return {
    users: Object.fromEntries(results.map(({ spaceKey, data }) => [spaceKey, data])),
    errors: results.filter(({ error }) => error),
  };
};
