-- Série quotidienne légère dédiée à la courbe des enjeux. Elle évite le coût
-- du calcul financier et du report par période de la RPC générale.

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
    SELECT COALESCE(p_date_from, min(suivi.date_suivi)) AS date_from,
      COALESCE(p_date_to, max(suivi.date_suivi)) AS date_to
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
  ),
  calendar AS MATERIALIZED (
    SELECT generated.day::DATE AS day
    FROM source_bounds
    CROSS JOIN LATERAL generate_series(
      source_bounds.date_from, source_bounds.date_to, INTERVAL '1 day'
    ) AS generated(day)
    WHERE source_bounds.date_from IS NOT NULL
      AND source_bounds.date_to IS NOT NULL
      AND source_bounds.date_from <= source_bounds.date_to
  ),
  baseline AS MATERIALIZED (
    SELECT requested.reference, previous.cumul_enjeux
    FROM requested
    CROSS JOIN source_bounds
    LEFT JOIN LATERAL (
      SELECT suivi.cumul_enjeux
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND suivi.date_suivi < source_bounds.date_from
        AND suivi.cumul_enjeux IS NOT NULL
      ORDER BY suivi.date_suivi DESC LIMIT 1
    ) AS previous ON TRUE
  ),
  observed AS MATERIALIZED (
    SELECT suivi.id_trm_mobi, suivi.date_suivi, suivi.cumul_enjeux,
      suivi.enjeux_jour
    FROM requested
    CROSS JOIN source_bounds
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
     AND suivi.date_suivi >= source_bounds.date_from
     AND suivi.date_suivi <= source_bounds.date_to
  ),
  grid AS MATERIALIZED (
    SELECT requested.reference, calendar.day,
      observed.cumul_enjeux AS cumul_observe,
      observed.enjeux_jour AS enjeux_secours,
      CASE
        WHEN observed.cumul_enjeux IS NOT NULL THEN observed.cumul_enjeux
        WHEN calendar.day = source_bounds.date_from THEN baseline.cumul_enjeux
        ELSE NULL
      END AS cumul_marque,
      observed.id_trm_mobi IS NOT NULL AS remonte
    FROM requested
    CROSS JOIN calendar
    CROSS JOIN source_bounds
    LEFT JOIN baseline ON baseline.reference = requested.reference
    LEFT JOIN observed
      ON observed.id_trm_mobi = requested.reference
     AND observed.date_suivi = calendar.day
  ),
  marked AS MATERIALIZED (
    SELECT grid.*,
      count(grid.cumul_marque) OVER (
        PARTITION BY grid.reference ORDER BY grid.day
      ) AS groupe_cumul
    FROM grid
  ),
  filled AS MATERIALIZED (
    SELECT marked.*,
      max(marked.cumul_marque) OVER (
        PARTITION BY marked.reference, marked.groupe_cumul
      ) AS cumul_reporte
    FROM marked
  ),
  with_previous AS MATERIALIZED (
    SELECT filled.*,
      COALESCE(
        lag(filled.cumul_reporte) OVER (
          PARTITION BY filled.reference ORDER BY filled.day
        ),
        baseline.cumul_enjeux
      ) AS cumul_precedent
    FROM filled
    LEFT JOIN baseline ON baseline.reference = filled.reference
  ),
  derived AS (
    SELECT with_previous.*,
      CASE WHEN with_previous.remonte THEN
        public.mobi_enjeux_depuis_cumul_v2(
          with_previous.cumul_observe,
          with_previous.cumul_precedent,
          with_previous.enjeux_secours
        ) ELSE 0 END AS enjeux_calcule
    FROM with_previous
  )
  SELECT derived.day AS periode,
    sum(derived.enjeux_calcule) AS enjeux_jour,
    sum(COALESCE(derived.cumul_reporte, 0)) AS cumul_enjeux,
    count(*) FILTER (WHERE derived.remonte)::BIGINT AS terminaux,
    1::BIGINT AS jours
  FROM derived
  GROUP BY derived.day
  ORDER BY derived.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  IS 'Courbe quotidienne des enjeux reconstitués depuis CUMUL_ENJEUX, avec report du dernier cumul connu par terminal.';

NOTIFY pgrst, 'reload schema';
