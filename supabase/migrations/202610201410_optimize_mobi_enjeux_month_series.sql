-- Pour les regroupements mensuel et annuel, le cache mensuel réduit la lecture
-- de plusieurs centaines de milliers de lignes à quelques milliers. Le cumul
-- est lu directement au dernier jour de chaque période et reste donc exact,
-- y compris lorsqu'un terminal n'a aucune remontée dans un mois donné.

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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
BEGIN
  IF p_granularity IN ('mois', 'annee') THEN
    RETURN QUERY
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
        SELECT cache.id_trm_mobi, cache.mois, cache.enjeux_periode,
          cache.jours_remontes
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
        daily.enjeux_calcule
      FROM requested
      CROSS JOIN LATERAL (
        SELECT cache.date_suivi, cache.enjeux_calcule
        FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
        WHERE cache.id_trm_mobi = requested.reference
          AND (p_date_from IS NULL OR cache.date_suivi >= p_date_from)
          AND (p_date_to IS NULL OR cache.date_suivi <= p_date_to)
          AND (
            (p_date_from IS NOT NULL
              AND p_date_from > date_trunc('month', cache.date_suivi)::DATE)
            OR
            (p_date_to IS NOT NULL
              AND p_date_to < (date_trunc('month', cache.date_suivi)
                + INTERVAL '1 month - 1 day')::DATE)
          )
        OFFSET 0
      ) AS daily
    ),
    partial_months AS MATERIALIZED (
      SELECT partial_daily.id_trm_mobi,
        date_trunc('month', partial_daily.date_suivi)::DATE AS mois,
        sum(partial_daily.enjeux_calcule) AS enjeux_periode,
        count(*)::BIGINT AS jours_remontes
      FROM partial_daily
      GROUP BY partial_daily.id_trm_mobi,
        date_trunc('month', partial_daily.date_suivi)::DATE
    ),
    monthly_source AS MATERIALIZED (
      SELECT * FROM complete_months
      UNION ALL
      SELECT * FROM partial_months
    ),
    terminal_periods_data AS MATERIALIZED (
      SELECT source.id_trm_mobi,
        CASE WHEN p_granularity = 'annee'
          THEN date_trunc('year', source.mois)::DATE
          ELSE source.mois
        END AS period_start,
        sum(source.enjeux_periode) AS period_stakes,
        sum(source.jours_remontes)::BIGINT AS reported_days
      FROM monthly_source AS source
      GROUP BY source.id_trm_mobi,
        CASE WHEN p_granularity = 'annee'
          THEN date_trunc('year', source.mois)::DATE
          ELSE source.mois
        END
    ),
    period_totals AS MATERIALIZED (
      SELECT data.period_start,
        sum(data.period_stakes) AS period_stakes,
        count(*)::BIGINT AS terminal_count,
        max(data.reported_days)::BIGINT AS reported_days
      FROM terminal_periods_data AS data
      GROUP BY data.period_start
    ),
    period_bounds AS MATERIALIZED (
      SELECT totals.*,
        CASE
          WHEN p_granularity = 'annee' THEN
            CASE WHEN p_date_to IS NULL
              THEN (totals.period_start + INTERVAL '1 year - 1 day')::DATE
              ELSE LEAST(p_date_to,
                (totals.period_start + INTERVAL '1 year - 1 day')::DATE)
            END
          ELSE
            CASE WHEN p_date_to IS NULL
              THEN (totals.period_start + INTERVAL '1 month - 1 day')::DATE
              ELSE LEAST(p_date_to,
                (totals.period_start + INTERVAL '1 month - 1 day')::DATE)
            END
        END AS cutoff
      FROM period_totals AS totals
    ),
    requested_periods AS MATERIALIZED (
      SELECT bounds.period_start, bounds.cutoff, requested.reference
      FROM period_bounds AS bounds
      CROSS JOIN requested
    ),
    period_cumulative AS MATERIALIZED (
      SELECT requested_periods.period_start,
        sum(COALESCE(snapshot.cumul_enjeux, 0)) AS cumulative_stakes
      FROM requested_periods
      LEFT JOIN LATERAL (
        SELECT cache.cumul_enjeux
        FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
        WHERE cache.id_trm_mobi = requested_periods.reference
          AND cache.date_suivi <= requested_periods.cutoff
          AND cache.cumul_enjeux IS NOT NULL
        ORDER BY cache.date_suivi DESC
        LIMIT 1
      ) AS snapshot ON TRUE
      GROUP BY requested_periods.period_start
    )
    SELECT bounds.period_start, bounds.period_stakes,
      COALESCE(cumulative.cumulative_stakes, 0),
      bounds.terminal_count, bounds.reported_days
    FROM period_bounds AS bounds
    LEFT JOIN period_cumulative AS cumulative
      ON cumulative.period_start = bounds.period_start
    ORDER BY bounds.period_start;
    RETURN;
  END IF;

  RETURN QUERY
  WITH requested AS MATERIALIZED (
    SELECT DISTINCT unnest(p_terminal_references) AS reference
    WHERE p_terminal_references IS NOT NULL
    UNION ALL
    SELECT latest.id_trm_mobi
    FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
    WHERE p_terminal_references IS NULL
  ),
  baseline AS MATERIALIZED (
    SELECT COALESCE(sum(previous.cumul_enjeux), 0) AS cumulative_stakes
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
    SELECT CASE WHEN p_granularity = 'jour'
        THEN actual.date_suivi
        ELSE date_trunc('week', actual.date_suivi)::DATE
      END AS period_start,
      sum(actual.enjeux_calcule) AS period_stakes,
      sum(actual.variation_cumul) AS cumulative_change,
      count(DISTINCT actual.id_trm_mobi)::BIGINT AS terminal_count,
      count(DISTINCT actual.date_suivi)::BIGINT AS reported_days
    FROM actual
    GROUP BY CASE WHEN p_granularity = 'jour'
      THEN actual.date_suivi
      ELSE date_trunc('week', actual.date_suivi)::DATE
    END
  )
  SELECT changes.period_start, changes.period_stakes,
    baseline.cumulative_stakes
      + sum(changes.cumulative_change) OVER (
        ORDER BY changes.period_start
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ),
    changes.terminal_count, changes.reported_days
  FROM period_changes AS changes
  CROSS JOIN baseline
  ORDER BY changes.period_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  IS 'Série temporelle optimisée : cache mensuel pour mois/année et cache quotidien pour jour/semaine.';

NOTIFY pgrst, 'reload schema';
