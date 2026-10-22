-- Optimise la correction de report des cumuls : le cache mensuel fournit le
-- dernier cumul des mois terminés et l'historique quotidien n'est consulté
-- que dans le mois de la borne recherchée.

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
    SELECT monthly.id_trm_mobi, monthly.premiere_date, monthly.derniere_date,
      monthly.jours_remontes, monthly.jours_avec_enjeux, monthly.enjeux_periode,
      monthly.gain_periode, monthly.annulation_periode
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS monthly
      ON monthly.id_trm_mobi = requested.reference
    WHERE (p_date_from IS NULL OR p_date_from <= monthly.mois)
      AND (p_date_to IS NULL OR p_date_to >= (monthly.mois + INTERVAL '1 month - 1 day')::DATE)
  ),
  partial_months AS (
    SELECT suivi.id_trm_mobi, min(suivi.date_suivi) AS premiere_date,
      max(suivi.date_suivi) AS derniere_date, count(*) AS jours_remontes,
      count(*) FILTER (WHERE suivi.enjeux_jour IS NOT NULL) AS jours_avec_enjeux,
      sum(COALESCE(suivi.enjeux_jour, 0)) AS enjeux_periode,
      sum(COALESCE(suivi.gain, 0)) AS gain_periode,
      sum(COALESCE(suivi.annulation, 0)) AS annulation_periode
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
    WHERE (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      AND ((p_date_from IS NOT NULL AND p_date_from > date_trunc('month', suivi.date_suivi)::DATE)
        OR (p_date_to IS NOT NULL AND p_date_to < (date_trunc('month', suivi.date_suivi) + INTERVAL '1 month - 1 day')::DATE))
    GROUP BY suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE
  ),
  totals AS (
    SELECT parts.id_trm_mobi, min(parts.premiere_date) AS premiere_date_periode,
      max(parts.derniere_date) AS derniere_date_periode,
      sum(parts.jours_remontes)::BIGINT AS jours_remontes,
      sum(parts.jours_avec_enjeux)::BIGINT AS jours_avec_enjeux,
      sum(parts.enjeux_periode) AS enjeux_periode,
      sum(parts.gain_periode) AS gain_periode,
      sum(parts.annulation_periode) AS annulation_periode
    FROM (SELECT * FROM complete_months UNION ALL SELECT * FROM partial_months) AS parts
    GROUP BY parts.id_trm_mobi
  ),
  latest_as_of AS (
    SELECT requested.reference AS id_trm_mobi, latest.date_suivi,
      latest.cumul_enjeux, latest.enjeux_jour
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
      ON latest.id_trm_mobi = requested.reference
    WHERE p_date_to IS NULL OR latest.date_suivi <= p_date_to
    UNION ALL
    SELECT requested.reference, snapshot.date_suivi,
      snapshot.cumul_enjeux, snapshot.enjeux_jour
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
      ON latest.id_trm_mobi = requested.reference
    JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.cumul_enjeux, suivi.enjeux_jour
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND suivi.date_suivi <= p_date_to
      ORDER BY suivi.date_suivi DESC
      LIMIT 1
    ) AS snapshot ON TRUE
    WHERE p_date_to IS NOT NULL AND latest.date_suivi > p_date_to
  )
  SELECT latest.id_trm_mobi, totals.premiere_date_periode, totals.derniere_date_periode,
    latest.date_suivi, COALESCE(totals.jours_remontes, 0), COALESCE(totals.jours_avec_enjeux, 0),
    COALESCE(totals.enjeux_periode, 0), latest.cumul_enjeux, latest.enjeux_jour,
    COALESCE(totals.gain_periode, 0), COALESCE(totals.annulation_periode, 0)
  FROM latest_as_of AS latest
  LEFT JOIN totals ON totals.id_trm_mobi = latest.id_trm_mobi
  ORDER BY latest.id_trm_mobi;
$$;

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
  period_bounds AS (
    SELECT totals.*,
      CASE p_granularity
        WHEN 'jour' THEN totals.periode
        WHEN 'semaine' THEN (totals.periode + 6)
        WHEN 'annee' THEN (totals.periode + INTERVAL '1 year - 1 day')::DATE
        ELSE (totals.periode + INTERVAL '1 month - 1 day')::DATE
      END AS periode_fin
    FROM period_totals AS totals
  )
  SELECT bounds.periode, bounds.enjeux_jour,
    COALESCE((
      SELECT sum(COALESCE(snapshot.cumul_enjeux, 0))
      FROM requested
      LEFT JOIN LATERAL (
        SELECT candidates.cumul_enjeux
        FROM (
          (SELECT monthly.derniere_date AS date_etat, monthly.cumul_enjeux_fin AS cumul_enjeux
           FROM public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS monthly
           WHERE monthly.id_trm_mobi = requested.reference
             AND monthly.derniere_date <= CASE WHEN p_date_to IS NULL
               THEN bounds.periode_fin ELSE LEAST(bounds.periode_fin, p_date_to) END
           ORDER BY monthly.mois DESC
           LIMIT 1)
          UNION ALL
          (SELECT suivi.date_suivi AS date_etat, suivi.cumul_enjeux
           FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
           WHERE suivi.id_trm_mobi = requested.reference
             AND suivi.date_suivi >= date_trunc('month', CASE WHEN p_date_to IS NULL
               THEN bounds.periode_fin ELSE LEAST(bounds.periode_fin, p_date_to) END)::DATE
             AND suivi.date_suivi <= CASE WHEN p_date_to IS NULL
               THEN bounds.periode_fin ELSE LEAST(bounds.periode_fin, p_date_to) END
           ORDER BY suivi.date_suivi DESC
           LIMIT 1)
        ) AS candidates
        ORDER BY candidates.date_etat DESC
        LIMIT 1
      ) AS snapshot ON TRUE
    ), 0) AS cumul_enjeux,
    bounds.terminaux, bounds.jours
  FROM period_bounds AS bounds
  ORDER BY bounds.periode;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
