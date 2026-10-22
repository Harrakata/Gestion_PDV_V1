-- Ne renvoie que les jours de remontée et les bornes demandées. Le client
-- complète localement les jours sans mouvement, ce qui évite de sérialiser
-- des centaines de lignes identiques par lot de terminaux.

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
        SELECT min(suivi.date_suivi)
        FROM requested
        JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
          ON suivi.id_trm_mobi = requested.reference
      )) AS date_from,
      COALESCE(p_date_to, (
        SELECT max(suivi.date_suivi)
        FROM requested
        JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
          ON suivi.id_trm_mobi = requested.reference
      )) AS date_to
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
  actual AS MATERIALIZED (
    SELECT suivi.id_trm_mobi, suivi.date_suivi, suivi.cumul_enjeux,
      suivi.enjeux_jour
    FROM requested
    CROSS JOIN source_bounds
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
     AND suivi.date_suivi >= source_bounds.date_from
     AND suivi.date_suivi <= source_bounds.date_to
  ),
  cumulative_events AS MATERIALIZED (
    SELECT baseline.reference AS id_trm_mobi,
      (source_bounds.date_from - 1) AS date_suivi,
      baseline.cumul_enjeux, NULL::NUMERIC AS enjeux_jour, FALSE AS remonte
    FROM baseline CROSS JOIN source_bounds
    WHERE baseline.cumul_enjeux IS NOT NULL
    UNION ALL
    SELECT actual.id_trm_mobi, actual.date_suivi, actual.cumul_enjeux,
      actual.enjeux_jour, TRUE
    FROM actual
    WHERE actual.cumul_enjeux IS NOT NULL
  ),
  sequenced AS MATERIALIZED (
    SELECT cumulative_events.*,
      lag(cumulative_events.cumul_enjeux) OVER (
        PARTITION BY cumulative_events.id_trm_mobi
        ORDER BY cumulative_events.date_suivi
      ) AS cumul_precedent
    FROM cumulative_events
  ),
  daily_changes AS MATERIALIZED (
    SELECT sequenced.date_suivi AS day,
      sum(public.mobi_enjeux_depuis_cumul_v2(
        sequenced.cumul_enjeux,
        sequenced.cumul_precedent,
        sequenced.enjeux_jour
      )) AS enjeux_jour,
      sum(sequenced.cumul_enjeux - COALESCE(sequenced.cumul_precedent, 0))
        AS variation_cumul
    FROM sequenced
    WHERE sequenced.remonte
    GROUP BY sequenced.date_suivi
  ),
  reported AS MATERIALIZED (
    SELECT actual.date_suivi AS day, count(DISTINCT actual.id_trm_mobi)::BIGINT AS terminaux
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
    SELECT COALESCE(sum(baseline.cumul_enjeux), 0) AS cumul
    FROM baseline
  )
  SELECT curve_days.day AS periode,
    COALESCE(daily_changes.enjeux_jour, 0) AS enjeux_jour,
    baseline_total.cumul + sum(COALESCE(daily_changes.variation_cumul, 0))
      OVER (ORDER BY curve_days.day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
      AS cumul_enjeux,
    COALESCE(reported.terminaux, 0)::BIGINT AS terminaux,
    1::BIGINT AS jours
  FROM curve_days
  CROSS JOIN baseline_total
  LEFT JOIN daily_changes ON daily_changes.day = curve_days.day
  LEFT JOIN reported ON reported.day = curve_days.day
  WHERE curve_days.day IS NOT NULL
  ORDER BY curve_days.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  IS 'Série quotidienne creuse des enjeux et du cumul ; les jours sans remontée sont complétés côté client.';

NOTIFY pgrst, 'reload schema';
