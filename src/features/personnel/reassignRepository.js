// Nouvelle affectation d'une personne (chef d'agence, chef de secteur). Client fourni par l'appelant.
//
// La fiche en cours garde son identifiant : compte, droits personnels, demandes en attente,
// notifications et statistiques suivent. L'ancienne affectation est conservée dans une fiche archivée.
const IDENTITY = ['matricule', 'nom', 'prenom', 'email', 'telephone', 'photo_url'];

/**
 * @param assignment   colonnes de l'affectation ; la première doit être libre (une personne par agence, par secteur).
 * @param takenMessage message si elle est déjà occupée, d'après la personne en place.
 */
export const reassign = async (client, { table, matricule, assignment, startsAt, takenMessage }) => {
  const columns = Object.keys(assignment);
  const found = await client.from(table).select(['id', ...IDENTITY, ...columns, 'valid_from'].join(', ')).eq('matricule', matricule).eq('is_current', true).limit(1);
  if (found.error) throw found.error;
  const current = found.data?.[0];
  if (!current) throw new Error('Chef actuel introuvable');

  const taken = await client.from(table).select('id, nom, prenom, matricule').eq(columns[0], assignment[columns[0]]).eq('is_current', true).neq('id', current.id).limit(1);
  if (taken.error) throw taken.error;
  if (taken.data?.length) throw new Error(takenMessage(taken.data[0]));

  const { id, ...previous } = current;
  const archive = await client.from(table).insert({ ...previous, is_current: false, valid_to: startsAt, auth_user_id: null }).select('id').single();
  if (archive.error) throw archive.error;

  const { error } = await client.from(table).update({ ...assignment, valid_from: startsAt }).eq('id', id);
  if (!error) return;
  // L'affectation n'a pas changé : la copie archivée n'a pas lieu d'être.
  await client.from(table).delete().eq('id', archive.data.id);
  throw error;
};
