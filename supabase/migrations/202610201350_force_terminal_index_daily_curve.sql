-- Force une lecture paramétrée par terminal. Sans cette barrière, PostgreSQL
-- peut choisir l'index par date sur les longues plages et balayer tout le parc.

CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_daily_curve_v2(
  p_terminal_references TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  periode DATE, enjeux_jour NUMERIC, cumul_enjeux NUMERIC,
  terminaux BIGINT, jours BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT unnest(p_terminal_references) AS reference
    WHERE p_terminal_references IS NOT NULL
    UNION ALL
    SELECT latest.id_trm_mobi
    FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
    WHERE p_terminal_references IS NULL
  ),
  source_bounds AS MATERIALIZED (
    SELECT
      COALESCE(p_date_from, (
        SELECT min(cache.date_suivi)
        FROM requested
        CROSS JOIN LATERAL (
          SELECT terminal_cache.date_suivi
          FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS terminal_cache
          WHERE terminal_cache.id_trm_mobi = requested.reference
          OFFSET 0
        ) AS cache
      )) AS date_from,
      COALESCE(p_date_to, (
        SELECT max(cache.date_suivi)
        FROM requested
        CROSS JOIN LATERAL (
          SELECT terminal_cache.date_suivi
          FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS terminal_cache
          WHERE terminal_cache.id_trm_mobi = requested.reference
          OFFSET 0
        ) AS cache
      )) AS date_to
  ),
  baseline AS MATERIALIZED (
    SELECT requested.reference, previous.cumul_enjeux
    FROM requested
    CROSS JOIN source_bounds
    LEFT JOIN LATERAL (
      SELECT cache.cumul_enjeux
      FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
      WHERE cache.id_trm_mobi = requested.reference
        AND cache.date_suivi < source_bounds.date_from
        AND cache.cumul_enjeux IS NOT NULL
      ORDER BY cache.date_suivi DESC LIMIT 1
    ) AS previous ON TRUE
  ),
  actual AS MATERIALIZED (
    SELECT cache.*
    FROM requested
    CROSS JOIN source_bounds
    CROSS JOIN LATERAL (
      SELECT terminal_cache.*
      FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS terminal_cache
      WHERE terminal_cache.id_trm_mobi = requested.reference
        AND terminal_cache.date_suivi >= source_bounds.date_from
        AND terminal_cache.date_suivi <= source_bounds.date_to
      OFFSET 0
    ) AS cache
  ),
  daily_changes AS MATERIALIZED (
    SELECT actual.date_suivi AS day,
      sum(actual.enjeux_calcule) AS enjeux_jour,
      sum(actual.variation_cumul) AS variation_cumul,
      count(DISTINCT actual.id_trm_mobi)::BIGINT AS terminaux
    FROM actual
    GROUP BY actual.date_suivi
  ),
  curve_days AS MATERIALIZED (
    SELECT source_bounds.date_from AS day FROM source_bounds
    UNION
    SELECT source_bounds.date_to AS day FROM source_bounds
    UNION
    SELECT actual.date_suivi AS day FROM actual
  ),
  baseline_total AS MATERIALIZED (
    SELECT COALESCE(sum(baseline.cumul_enjeux), 0) AS cumul FROM baseline
  )
  SELECT curve_days.day AS periode,
    COALESCE(daily_changes.enjeux_jour, 0) AS enjeux_jour,
    baseline_total.cumul + sum(COALESCE(daily_changes.variation_cumul, 0))
      OVER (ORDER BY curve_days.day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
      AS cumul_enjeux,
    COALESCE(daily_changes.terminaux, 0)::BIGINT AS terminaux,
    1::BIGINT AS jours
  FROM curve_days
  CROSS JOIN baseline_total
  LEFT JOIN daily_changes ON daily_changes.day = curve_days.day
  WHERE curve_days.day IS NOT NULL
  ORDER BY curve_days.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
