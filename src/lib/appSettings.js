import { supabase } from '@/lib/supabaseClient';

// Les réglages demandés au même moment (démarrage, ouverture d'un espace) partent en une seule
// requête. Rien n'est gardé ensuite : une lecture faite plus tard est toujours fraîche.
const BATCH_MS = 30;
let batch = null;

const openBatch = () => {
  const keys = new Set();
  const rows = new Promise((resolve) => { setTimeout(resolve, BATCH_MS); }).then(async () => {
    batch = null;
    const { data, error } = await supabase.from('app_settings').select('key, value').in('key', [...keys]);
    if (error) throw error;
    return new Map((data || []).map((row) => [row.key, row.value]));
  });
  return { keys, rows };
};

/** Lit une valeur de `app_settings` (null si absente). */
export async function loadAppSetting(key) {
  if (!batch) batch = openBatch();
  batch.keys.add(key);
  const rows = await batch.rows;
  return rows.get(key) ?? null;
}

/** Même lecture, sous la forme d'une réponse Supabase : { data: { value } | null, error }. */
export async function readAppSetting(key) {
  try {
    const value = await loadAppSetting(key);
    return { data: value === null ? null : { value }, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Enregistre une valeur de `app_settings`. La table n'a pas de contrainte unique
 * garantie sur `key` : lecture puis mise à jour ou insertion.
 */
export async function saveAppSetting(key, value) {
  const { data: existing, error: readError } = await supabase.from('app_settings').select('id').eq('key', key).maybeSingle();
  if (readError) throw readError;
  const { error } = existing
    ? await supabase.from('app_settings').update({ value }).eq('id', existing.id)
    : await supabase.from('app_settings').insert({ key, value });
  if (error) throw error;
}
