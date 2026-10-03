import { supabase } from '@/lib/supabaseClient';
import { cachedQuery } from '@/lib/offlineCache';

const _cache = { data: null, ts: 0 };
const TTL = 120_000;

export const invalidateSecteursCache = () => { _cache.data = null; _cache.ts = 0; };

export const normalizeSecteurText = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const secteurMatchesValue = (secteur, value) => {
  const normalizedValue = normalizeSecteurText(value);
  return (
    normalizeSecteurText(secteur?.nom) === normalizedValue ||
    normalizeSecteurText(secteur?.codeSecteur) === normalizedValue
  );
};

const sortSecteurs = (secteurs = []) =>
  [...secteurs].sort((firstSecteur, secondSecteur) =>
    String(firstSecteur?.nom || '').localeCompare(String(secondSecteur?.nom || ''), 'fr')
  );

export const fetchSecteurs = async () => {
  if (_cache.data && Date.now() - _cache.ts < TTL) {
    return { data: _cache.data, error: null };
  }
  const result = await cachedQuery(
    'ref:secteurs',
    () => supabase.from('secteurs').select('id, nom, codeSecteur, region, attributaire').order('nom', { ascending: true }),
  );
  if (!result.error) {
    _cache.data = sortSecteurs(result.data || []);
    _cache.ts = Date.now();
    return { ...result, data: _cache.data };
  }
  if (_cache.data) return { data: _cache.data, error: null, stale: true };
  return { ...result, data: [] };
};

/**
 * Options de secteurs, optionnellement filtrées par région.
 */
export const buildSecteurOptions = (
  secteurs,
  { region = null, includeAllLabel = null, allValue = '__all__' } = {}
) => {
  const filtered = (secteurs || [])
    .filter((s) => s?.nom)
    .filter((s) => !region || normalizeSecteurText(s.region) === normalizeSecteurText(region))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const options = Array.from(
    new Map(
      filtered.map((s) => [
        normalizeSecteurText(s.nom),
        { value: s.nom, label: s.codeSecteur ? `${s.codeSecteur} • ${s.nom}` : s.nom },
      ])
    ).values()
  );

  return includeAllLabel ? [{ value: allValue, label: includeAllLabel }, ...options] : options;
};

export const isKnownSecteur = (secteurs, secteurName) =>
  (secteurs || []).some((s) => secteurMatchesValue(s, secteurName));

export const resolveSecteurName = (secteurs, value) =>
  (secteurs || []).find((s) => secteurMatchesValue(s, value))?.nom || '';

/**
 * Renvoie le nom de la région à laquelle appartient un secteur.
 */
export const getSecteurRegion = (secteurs, secteurValue) =>
  (secteurs || []).find((s) => secteurMatchesValue(s, secteurValue))?.region || '';
