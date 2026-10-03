import { supabase } from '@/lib/supabaseClient';
import { cachedQuery } from '@/lib/offlineCache';

const _cache = { data: null, ts: 0 };
const TTL = 120_000;

export const invalidateRegionsCache = () => { _cache.data = null; _cache.ts = 0; };

export const normalizeRegionText = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const regionMatchesValue = (region, value) => {
  const normalizedValue = normalizeRegionText(value);

  return (
    normalizeRegionText(region?.nom) === normalizedValue ||
    normalizeRegionText(region?.codeRegion) === normalizedValue
  );
};

const sortRegions = (regions = []) =>
  [...regions].sort((firstRegion, secondRegion) =>
    String(firstRegion?.nom || '').localeCompare(String(secondRegion?.nom || ''), 'fr')
  );

export const fetchRegions = async ({ activeOnly = false } = {}) => {
  if (_cache.data && Date.now() - _cache.ts < TTL) {
    return { data: _cache.data, error: null };
  }
  const result = await cachedQuery(
    'ref:regions',
    () => supabase.from('regions').select('id, nom, codeRegion, description').order('nom', { ascending: true }),
  );
  if (!result.error) {
    _cache.data = sortRegions(result.data || []);
    _cache.ts = Date.now();
    return { ...result, data: _cache.data };
  }
  if (_cache.data) return { data: _cache.data, error: null, stale: true };
  return { ...result, data: [] };
};

export const buildRegionOptions = (
  regions,
  {
    includeAllLabel = null,
    allValue = '__all__',
    activeOnly = false,
    currentValue = '',
  } = {}
) => {
  const filteredRegions = (regions || [])
    .filter((region) => region?.nom)
    .sort((firstRegion, secondRegion) => firstRegion.nom.localeCompare(secondRegion.nom, 'fr'));

  const options = Array.from(
    new Map(
      filteredRegions.map((region) => [
        normalizeRegionText(region.nom),
        {
          value: region.nom,
          label: region.codeRegion ? `${region.codeRegion} • ${region.nom}` : region.nom,
        },
      ])
    ).values()
  );

  return includeAllLabel
    ? [{ value: allValue, label: includeAllLabel }, ...options]
    : options;
};

export const isKnownRegion = (regions, regionName) =>
  (regions || []).some((region) => regionMatchesValue(region, regionName));

export const resolveRegionName = (regions, value) =>
  (regions || []).find((region) => regionMatchesValue(region, value))?.nom || '';
