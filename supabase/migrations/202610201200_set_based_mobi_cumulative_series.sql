-- Version ensembliste du report de cumul. Elle évite une recherche latérale
-- par terminal et par période afin de rester sous le statement_timeout sur
-- les lots couvrant tout le parc.

CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_series_v2(
  p_terminal_references TEXT[] DEFAULT NULL, p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL, p_granularity TEXT DEFAULT 'mois'
)
RETURNS TABLE (periode DATE, enjeux_jour NUMERIC, cumul_enjeux NUMERIC, terminaux BIGINT, jours BIGINT)
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
  complete_months AS (
    SELECT monthly.id_trm_mobi, monthly.mois, monthly.enjeux_periode,
      monthly.jours_remontes
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS monthly
      ON monthly.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('mois', 'annee')
      AND (p_date_from IS NULL OR p_date_from <= monthly.mois)
      AND (p_date_to IS NULL OR p_date_to >= (monthly.mois + INTERVAL '1 month - 1 day')::DATE)
  ),
  partial_months AS (
    SELECT suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE AS mois,
      sum(COALESCE(suivi.enjeux_jour, 0)) AS enjeux_periode,
      count(*) AS jours_remontes
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('mois', 'annee')
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      AND ((p_date_from IS NOT NULL AND p_date_from > date_trunc('month', suivi.date_suivi)::DATE)
        OR (p_date_to IS NOT NULL AND p_date_to < (date_trunc('month', suivi.date_suivi) + INTERVAL '1 month - 1 day')::DATE))
    GROUP BY suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE
  ),
  monthly_source AS (
    SELECT * FROM complete_months
    UNION ALL
    SELECT * FROM partial_months
  ),
  monthly_result AS (
    SELECT CASE WHEN p_granularity = 'annee' THEN date_trunc('year', source.mois)::DATE ELSE source.mois END AS periode,
      sum(source.enjeux_periode) AS enjeux_jour,
      count(DISTINCT source.id_trm_mobi)::BIGINT AS terminaux,
      max(source.jours_remontes)::BIGINT AS jours
    FROM monthly_source AS source
    GROUP BY CASE WHEN p_granularity = 'annee' THEN date_trunc('year', source.mois)::DATE ELSE source.mois END
  ),
  raw_scoped AS (
    SELECT suivi.id_trm_mobi, suivi.date_suivi, suivi.enjeux_jour,
      CASE WHEN p_granularity = 'jour' THEN suivi.date_suivi
        ELSE date_trunc('week', suivi.date_suivi)::DATE END AS periode
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('jour', 'semaine')
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
  ),
  raw_result AS (
    SELECT raw_scoped.periode, sum(COALESCE(raw_scoped.enjeux_jour, 0)) AS enjeux_jour,
      count(DISTINCT raw_scoped.id_trm_mobi)::BIGINT AS terminaux,
      count(DISTINCT raw_scoped.date_suivi)::BIGINT AS jours
    FROM raw_scoped
    GROUP BY raw_scoped.periode
  ),
  period_totals AS (
    SELECT * FROM monthly_result
    UNION ALL
    SELECT * FROM raw_result
  ),
  period_bounds AS MATERIALIZED (
    SELECT totals.*,
      CASE WHEN p_date_to IS NULL THEN
        CASE p_granularity
          WHEN 'jour' THEN totals.periode
          WHEN 'semaine' THEN (totals.periode + 6)
          WHEN 'annee' THEN (totals.periode + INTERVAL '1 year - 1 day')::DATE
          ELSE (totals.periode + INTERVAL '1 month - 1 day')::DATE
        END
      ELSE LEAST(p_date_to,
        CASE p_granularity
          WHEN 'jour' THEN totals.periode
          WHEN 'semaine' THEN (totals.periode + 6)
          WHEN 'annee' THEN (totals.periode + INTERVAL '1 year - 1 day')::DATE
          ELSE (totals.periode + INTERVAL '1 month - 1 day')::DATE
        END)
      END AS cutoff
    FROM period_totals AS totals
  ),
  terminal_periods AS MATERIALIZED (
    SELECT bounds.periode, bounds.cutoff, requested.reference
    FROM period_bounds AS bounds
    CROSS JOIN requested
  ),
  monthly_state AS (
    SELECT terminal_periods.periode, terminal_periods.reference,
      (array_agg(monthly.derniere_date ORDER BY monthly.derniere_date DESC)
        FILTER (WHERE monthly.derniere_date IS NOT NULL))[1] AS date_etat,
      (array_agg(monthly.cumul_enjeux_fin ORDER BY monthly.derniere_date DESC)
        FILTER (WHERE monthly.derniere_date IS NOT NULL))[1] AS cumul_enjeux
    FROM terminal_periods
    LEFT JOIN public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS monthly
      ON monthly.id_trm_mobi = terminal_periods.reference
      AND monthly.derniere_date <= terminal_periods.cutoff
    GROUP BY terminal_periods.periode, terminal_periods.reference
  ),
  daily_state AS (
    SELECT terminal_periods.periode, terminal_periods.reference,
      (array_agg(suivi.date_suivi ORDER BY suivi.date_suivi DESC)
        FILTER (WHERE suivi.date_suivi IS NOT NULL))[1] AS date_etat,
      (array_agg(suivi.cumul_enjeux ORDER BY suivi.date_suivi DESC)
        FILTER (WHERE suivi.date_suivi IS NOT NULL))[1] AS cumul_enjeux
    FROM terminal_periods
    LEFT JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = terminal_periods.reference
      AND suivi.date_suivi >= date_trunc('month', terminal_periods.cutoff)::DATE
      AND suivi.date_suivi <= terminal_periods.cutoff
    GROUP BY terminal_periods.periode, terminal_periods.reference
  ),
  period_cumulative AS (
    SELECT monthly_state.periode,
      sum(COALESCE(CASE
        WHEN daily_state.date_etat IS NOT NULL
          AND (monthly_state.date_etat IS NULL OR daily_state.date_etat >= monthly_state.date_etat)
        THEN daily_state.cumul_enjeux
        ELSE monthly_state.cumul_enjeux
      END, 0)) AS cumul_enjeux
    FROM monthly_state
    JOIN daily_state USING (periode, reference)
    GROUP BY monthly_state.periode
  )
  SELECT bounds.periode, bounds.enjeux_jour,
    COALESCE(cumulative.cumul_enjeux, 0), bounds.terminaux, bounds.jours
  FROM period_bounds AS bounds
  LEFT JOIN period_cumulative AS cumulative USING (periode)
  ORDER BY bounds.periode;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
