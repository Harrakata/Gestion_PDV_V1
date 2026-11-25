// Le client est fourni par l'appelant.
const countBefore = async (client, table, column, cutoff) => {
  const { count, error } = await client.from(table).select('id', { count: 'exact', head: true }).lt(column, cutoff);
  if (error) throw error;
  return count || 0;
};

/** Connexions et évènements antérieurs à une date. */
export const countActivityBefore = async (client, cutoff) => {
  const [sessions, events] = await Promise.all([
    countBefore(client, 'activites_sessions', 'last_seen_at', cutoff),
    countBefore(client, 'activites_evenements', 'created_at', cutoff),
  ]);
  return { sessions, events };
};
