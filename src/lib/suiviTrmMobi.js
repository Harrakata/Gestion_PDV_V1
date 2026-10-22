export const SUIVI_TRM_MOBI_TABLE = 'SUIVI_TRM_MOBI_QUOTIDIEN_V2';
export const SUIVI_TRM_MOBI_LATEST_RPC = 'get_latest_suivi_trm_mobi_v2';

export const normalizeMobiTerminalReference = (value) => String(value ?? '')
  .trim()
  .toUpperCase();

/**
 * Associe le dernier état connu au référentiel maître des terminaux.
 *
 * Le référentiel reste la population de départ : un terminal qui n'a jamais
 * remonté est donc conservé avec `has_suivi_state: false` et des mesures
 * quotidiennes nulles. `has_daily_state` est conservé comme alias de
 * compatibilité avec les consommateurs existants.
 */
export const associateMobiReferenceWithDailyState = (terminals = [], latestRows = []) => {
  const latestByReference = new Map();

  latestRows.forEach((row) => {
    const reference = normalizeMobiTerminalReference(row?.id_trm_mobi);
    if (reference) latestByReference.set(reference, row);
  });

  return terminals
    .filter((terminal) => normalizeMobiTerminalReference(terminal?.reference))
    .map((terminal) => {
      const reference = String(terminal.reference).trim();
      const latestState = latestByReference.get(normalizeMobiTerminalReference(reference)) || null;

      return {
        ...(latestState || {}),
        id_trm_mobi: reference,
        terminal_id: terminal.id ?? null,
        terminal_modele: terminal.modele ?? null,
        terminal_statut: terminal.statut ?? null,
        terminal_date_mise_en_service: terminal.dateMiseEnService ?? null,
        has_suivi_state: Boolean(latestState),
        has_daily_state: Boolean(latestState),
      };
    });
};

const suiviTrmMobiTable = (client) => client
  .schema('public')
  .from(SUIVI_TRM_MOBI_TABLE);

const withSnapshotColumns = (columns) => {
  if (!columns || columns === '*') return '*';

  const selected = columns.split(',').map((column) => column.trim()).filter(Boolean);
  for (const required of ['date_suivi', 'id_trm_mobi']) {
    if (!selected.includes(required)) selected.unshift(required);
  }
  return selected.join(', ');
};

export const chunkMobiTerminalReferences = (references = [], chunkSize = 200) => {
  const size = Number.isInteger(chunkSize) && chunkSize > 0 ? chunkSize : 200;
  const uniqueReferences = [...new Set(
    references
      .map((reference) => String(reference ?? '').trim())
      .filter(Boolean)
  )];
  const chunks = [];

  for (let offset = 0; offset < uniqueReferences.length; offset += size) {
    chunks.push(uniqueReferences.slice(offset, offset + size));
  }

  return chunks;
};

/**
 * Charge la dernière remontée disponible pour chaque terminal.
 *
 * La sélection est effectuée côté PostgreSQL afin de ne pas transférer tout
 * l'historique quotidien au navigateur. Le résultat contient au plus une
 * ligne par ID_TRM_MOBI, avec sa propre DATE_SUIVI.
 */
export const fetchLatestMobiSuiviRows = async (
  client,
  { columns = '*', references = [], pageSize = 1000, referenceChunkSize = 200 } = {},
) => {
  const referenceChunks = chunkMobiTerminalReferences(references, referenceChunkSize);
  const queryScopes = referenceChunks.length > 0 ? referenceChunks : [null];
  const rows = [];

  for (const referenceChunk of queryScopes) {
    for (let offset = 0; ; offset += pageSize) {
      const query = client
        .schema('public')
        .rpc(SUIVI_TRM_MOBI_LATEST_RPC, {
          p_terminal_references: referenceChunk,
        })
        .select(withSnapshotColumns(columns))
        .order('id_trm_mobi', { ascending: true });

      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) return { data: null, error, dateSuivi: null };

      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
  }

  const dateSuivi = rows.reduce(
    (latestDate, row) => (!latestDate || row.date_suivi > latestDate ? row.date_suivi : latestDate),
    null,
  );

  return {
    data: rows.sort((left, right) => String(left.id_trm_mobi).localeCompare(String(right.id_trm_mobi))),
    error: null,
    dateSuivi,
  };
};

export const fetchLatestMobiSuiviRow = async (client, reference, columns = '*') => {
  if (!reference) return { data: null, error: null };

  return suiviTrmMobiTable(client)
    .select(withSnapshotColumns(columns))
    .eq('id_trm_mobi', reference)
    .order('date_suivi', { ascending: false })
    .limit(1)
    .maybeSingle();
};
