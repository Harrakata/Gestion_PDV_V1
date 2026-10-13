import { supabase } from '@/lib/supabaseClient';

const normalizeReference = (value) => String(value || '').trim().toLocaleUpperCase('fr-FR');

const STATUS_PRIORITY = {
  defectueux: 0,
  assigne: 1,
  a_tester: 2,
};

export const getStockDefectueuxRecordIds = (item) => {
  if (!item) return [];
  return [...new Set([item.id, ...(item.duplicate_ids || [])].filter(Boolean))];
};

/**
 * Regroupe uniquement les doublons encore actifs. Les lignes réparées restent
 * distinctes afin de conserver l'historique des passages en atelier.
 */
export const regrouperStockDefectueuxActif = (rows = []) => {
  const groupedRows = [];
  const activeByKey = new Map();

  for (const row of rows) {
    const reference = normalizeReference(row.reference_sous_ensemble);
    const type = String(row.type_sous_ensemble || '').trim().toLowerCase();
    const isActive = row.statut !== 'repare';

    if (!isActive || !reference || !type) {
      groupedRows.push({ ...row, duplicate_ids: [row.id].filter(Boolean), duplicate_count: 1 });
      continue;
    }

    const key = `${type}::${reference}`;
    const existingIndex = activeByKey.get(key);

    if (existingIndex === undefined) {
      activeByKey.set(key, groupedRows.length);
      groupedRows.push({ ...row, duplicate_ids: [row.id].filter(Boolean), duplicate_count: 1 });
      continue;
    }

    const existing = groupedRows[existingIndex];
    const rowHasAdvancedStatus = (STATUS_PRIORITY[row.statut] ?? -1) > (STATUS_PRIORITY[existing.statut] ?? -1);
    const duplicateIds = [...new Set([...existing.duplicate_ids, row.id].filter(Boolean))];

    groupedRows[existingIndex] = {
      ...existing,
      ...(rowHasAdvancedStatus ? {
        statut: row.statut,
        technicien_id: row.technicien_id || existing.technicien_id,
        technicien_nom: row.technicien_nom || existing.technicien_nom,
      } : {}),
      duplicate_ids: duplicateIds,
      duplicate_count: duplicateIds.length,
    };
  }

  return groupedRows;
};

/**
 * Ajoute un sous-ensemble remplacé lors d'une maintenance curative au stock défectueux.
 * À appeler depuis le formulaire d'enregistrement d'intervention curative.
 *
 * @param {object} params
 * @param {string} params.referenceSousEnsemble - Référence de l'équipement (ex: "IMP-001")
 * @param {string} params.typeSousEnsemble - Type : 'imprimante' | 'lecteur' | 'ecran' | 'afficheur'
 * @param {string} params.typeTerminal - Type terminal : '2020' | '2031'
 * @param {string|number} params.agenceProvenance - ID de l'agence de provenance
 * @param {string} params.dateEntree - Date de l'intervention (ISO string)
 * @param {string} params.commentaire - Commentaire de remplacement
 * @param {string|number} [params.interventionId] - ID de l'intervention liée
 * @returns {Promise<{data, error}>}
 */
export const ajouterAuStockDefectueux = async ({
  referenceSousEnsemble,
  typeSousEnsemble,
  typeTerminal,
  agenceProvenance,
  dateEntree,
  commentaire,
  interventionId,
}) => {
  if (!referenceSousEnsemble || !typeSousEnsemble) {
    return { data: null, error: new Error('Référence et type de sous-ensemble requis.') };
  }

  const normalizedReference = String(referenceSousEnsemble).trim();

  // Une référence physique ne peut avoir qu'un seul cycle de réparation actif.
  // On conserve néanmoins les anciennes lignes réparées pour l'historique.
  const { data: activeRows, error: lookupError } = await supabase
    .from('stock_defectueux')
    .select('*')
    .eq('type_sous_ensemble', typeSousEnsemble)
    .neq('statut', 'repare')
    .order('date_entree', { ascending: false });

  if (lookupError) return { data: null, error: lookupError };

  const existing = (activeRows || []).find(
    (row) => normalizeReference(row.reference_sous_ensemble) === normalizeReference(normalizedReference)
  );

  if (existing) {
    return { data: existing, error: null, deduplicated: true };
  }

  const payload = {
    reference_sous_ensemble: normalizedReference,
    type_sous_ensemble: typeSousEnsemble,
    type_terminal: typeTerminal || null,
    statut: 'defectueux',
    agence_provenance_id: agenceProvenance || null,
    date_entree: dateEntree || new Date().toISOString(),
    commentaire: commentaire || null,
    intervention_id: interventionId || null,
  };

  return supabase.from('stock_defectueux').insert(payload).select().single();
};

/**
 * Met à jour le statut d'un sous-ensemble défectueux dans le stock.
 * Règle : seul l'espace Exploitation peut modifier le stock.
 */
export const updateStatutStockDefectueux = async (id, statut) => {
  const updates = { statut };
  if (statut === 'repare') {
    updates.date_sortie = new Date().toISOString();
  }
  return supabase.from('stock_defectueux').update(updates).eq('id', id);
};
