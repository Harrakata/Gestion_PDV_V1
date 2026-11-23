import { supabase } from '@/lib/supabaseClient';

/** Lit une valeur de `app_settings` (null si absente). */
export async function loadAppSetting(key) {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
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
