-- Les imports quotidiens volumineux rendaient les fonctions de synthèse et de
-- série sensibles au statement_timeout de PostgREST. Les calculs ci-dessous
-- s'appuient sur les caches déjà maintenus à l'import et forcent une lecture
-- par terminal, afin d'éviter tout balayage global de la table source.

CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_terminal_summary_v2(
  p_terminal_references TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  id_trm_mobi TEXT, premiere_date_periode DATE, derniere_date_periode DATE,
  date_dernier_etat DATE, jours_remontes BIGINT, jours_avec_enjeux BIGINT,
  enjeux_periode NUMERIC, cumul_enjeux NUMERIC, dernier_enjeux_jour NUMERIC,
  gain_periode NUMERIC, annulation_periode NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT unnest(p_terminal_references) AS reference
    WHERE p_terminal_references IS NOT NULL
    UNION ALL
    SELECT latest.id_trm_mobi
    FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
    WHERE p_terminal_references IS NULL
  ),
  complete_months AS MATERIALIZED (
    SELECT monthly.*
    FROM requested
    CROSS JOIN LATERAL (
      SELECT cache.id_trm_mobi, cache.premiere_date, cache.derniere_date,
        cache.jours_remontes, cache.jours_avec_enjeux, cache.enjeux_periode,
        cache.gain_periode, cache.annulation_periode
      FROM public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS cache
      WHERE cache.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR p_date_from <= cache.mois)
        AND (p_date_to IS NULL
          OR p_date_to >= (cache.mois + INTERVAL '1 month - 1 day')::DATE)
      OFFSET 0
    ) AS monthly
  ),
  partial_daily AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, daily.date_suivi,
      daily.enjeux_calcule, daily.gain, daily.annulation
    FROM requested
    CROSS JOIN LATERAL (
      SELECT calc.date_suivi, calc.enjeux_calcule,
        COALESCE(source.gain, 0) AS gain,
        COALESCE(source.annulation, 0) AS annulation
      FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS calc
      JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS source
        ON source.id_trm_mobi = calc.id_trm_mobi
       AND source.date_suivi = calc.date_suivi
      WHERE calc.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR calc.date_suivi >= p_date_from)
        AND (p_date_to IS NULL OR calc.date_suivi <= p_date_to)
        AND (
          (p_date_from IS NOT NULL
            AND p_date_from > date_trunc('month', calc.date_suivi)::DATE)
          OR
          (p_date_to IS NOT NULL
            AND p_date_to < (date_trunc('month', calc.date_suivi)
              + INTERVAL '1 month - 1 day')::DATE)
        )
      OFFSET 0
    ) AS daily
  ),
  partial_months AS (
    SELECT partial_daily.id_trm_mobi,
      min(partial_daily.date_suivi) AS premiere_date,
      max(partial_daily.date_suivi) AS derniere_date,
      count(*)::BIGINT AS jours_remontes,
      count(*) FILTER (WHERE partial_daily.enjeux_calcule > 0)::BIGINT
        AS jours_avec_enjeux,
      sum(partial_daily.enjeux_calcule) AS enjeux_periode,
      sum(partial_daily.gain) AS gain_periode,
      sum(partial_daily.annulation) AS annulation_periode
    FROM partial_daily
    GROUP BY partial_daily.id_trm_mobi,
      date_trunc('month', partial_daily.date_suivi)::DATE
  ),
  totals AS (
    SELECT parts.id_trm_mobi,
      min(parts.premiere_date) AS premiere_date_periode,
      max(parts.derniere_date) AS derniere_date_periode,
      sum(parts.jours_remontes)::BIGINT AS jours_remontes,
      sum(parts.jours_avec_enjeux)::BIGINT AS jours_avec_enjeux,
      sum(parts.enjeux_periode) AS enjeux_periode,
      sum(parts.gain_periode) AS gain_periode,
      sum(parts.annulation_periode) AS annulation_periode
    FROM (
      SELECT * FROM complete_months
      UNION ALL
      SELECT * FROM partial_months
    ) AS parts
    GROUP BY parts.id_trm_mobi
  ),
  latest_as_of AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, snapshot.date_suivi,
      snapshot.cumul_enjeux, snapshot.enjeux_calcule
    FROM requested
    CROSS JOIN LATERAL (
      SELECT cache.date_suivi, cache.cumul_enjeux, cache.enjeux_calcule
      FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
      WHERE cache.id_trm_mobi = requested.reference
        AND (p_date_to IS NULL OR cache.date_suivi <= p_date_to)
      ORDER BY cache.date_suivi DESC
      LIMIT 1
    ) AS snapshot
  )
  SELECT latest.id_trm_mobi, totals.premiere_date_periode,
    totals.derniere_date_periode, latest.date_suivi,
    COALESCE(totals.jours_remontes, 0),
    COALESCE(totals.jours_avec_enjeux, 0),
    COALESCE(totals.enjeux_periode, 0), latest.cumul_enjeux,
    latest.enjeux_calcule, COALESCE(totals.gain_periode, 0),
    COALESCE(totals.annulation_periode, 0)
  FROM latest_as_of AS latest
  LEFT JOIN totals ON totals.id_trm_mobi = latest.id_trm_mobi
  ORDER BY latest.id_trm_mobi;
$$;

CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_series_v2(
  p_terminal_references TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_granularity TEXT DEFAULT 'mois'
)
RETURNS TABLE (
  periode DATE, enjeux_jour NUMERIC, cumul_enjeux NUMERIC,
  terminaux BIGINT, jours BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT unnest(p_terminal_references) AS reference
    WHERE p_terminal_references IS NOT NULL
    UNION ALL
    SELECT latest.id_trm_mobi
    FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
    WHERE p_terminal_references IS NULL
  ),
  baseline AS MATERIALIZED (
    SELECT COALESCE(sum(previous.cumul_enjeux), 0) AS cumul_enjeux
    FROM requested
    LEFT JOIN LATERAL (
      SELECT cache.cumul_enjeux
      FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
      WHERE cache.id_trm_mobi = requested.reference
        AND p_date_from IS NOT NULL
        AND cache.date_suivi < p_date_from
        AND cache.cumul_enjeux IS NOT NULL
      ORDER BY cache.date_suivi DESC
      LIMIT 1
    ) AS previous ON TRUE
  ),
  actual AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, cache.date_suivi,
      cache.enjeux_calcule, cache.variation_cumul
    FROM requested
    CROSS JOIN LATERAL (
      SELECT terminal_cache.date_suivi, terminal_cache.enjeux_calcule,
        terminal_cache.variation_cumul
      FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS terminal_cache
      WHERE terminal_cache.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR terminal_cache.date_suivi >= p_date_from)
        AND (p_date_to IS NULL OR terminal_cache.date_suivi <= p_date_to)
      OFFSET 0
    ) AS cache
  ),
  period_changes AS MATERIALIZED (
    SELECT CASE p_granularity
        WHEN 'jour' THEN actual.date_suivi
        WHEN 'semaine' THEN date_trunc('week', actual.date_suivi)::DATE
        WHEN 'annee' THEN date_trunc('year', actual.date_suivi)::DATE
        ELSE date_trunc('month', actual.date_suivi)::DATE
      END AS periode,
      sum(actual.enjeux_calcule) AS enjeux_jour,
      sum(actual.variation_cumul) AS variation_cumul,
      count(DISTINCT actual.id_trm_mobi)::BIGINT AS terminaux,
      count(DISTINCT actual.date_suivi)::BIGINT AS jours
    FROM actual
    GROUP BY CASE p_granularity
      WHEN 'jour' THEN actual.date_suivi
      WHEN 'semaine' THEN date_trunc('week', actual.date_suivi)::DATE
      WHEN 'annee' THEN date_trunc('year', actual.date_suivi)::DATE
      ELSE date_trunc('month', actual.date_suivi)::DATE
    END
  )
  SELECT period_changes.periode, period_changes.enjeux_jour,
    baseline.cumul_enjeux
      + sum(period_changes.variation_cumul) OVER (
        ORDER BY period_changes.periode
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumul_enjeux,
    period_changes.terminaux, period_changes.jours
  FROM period_changes
  CROSS JOIN baseline
  ORDER BY period_changes.periode;
$$;

ALTER FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  SET statement_timeout = '15s';

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  IS 'Synthèse par terminal issue des caches mensuel et quotidien, optimisée pour les historiques volumineux.';
COMMENT ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  IS 'Série temporelle calculée depuis le cache quotidien des écarts de CUMUL_ENJEUX, avec report exact du cumul.';

NOTIFY pgrst, 'reload schema';
