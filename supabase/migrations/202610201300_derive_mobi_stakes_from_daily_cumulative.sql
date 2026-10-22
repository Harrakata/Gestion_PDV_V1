-- Reconstruit les enjeux quotidiens depuis CUMUL_ENJEUX, puis les agrège à la
-- granularité demandée. ENJEUX_JOUR n'est utilisé qu'en secours lorsqu'aucun
-- cumul antérieur n'existe pour la toute première observation d'un terminal.

CREATE OR REPLACE FUNCTION public.mobi_enjeux_depuis_cumul_v2(
  p_cumul NUMERIC, p_cumul_precedent NUMERIC, p_enjeux_secours NUMERIC DEFAULT 0
)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_cumul IS NULL THEN 0
    WHEN p_cumul_precedent IS NULL THEN GREATEST(COALESCE(p_enjeux_secours, 0), 0)
    WHEN p_cumul >= p_cumul_precedent THEN p_cumul - p_cumul_precedent
    ELSE GREATEST(p_cumul, 0)
  END;
$$;

COMMENT ON FUNCTION public.mobi_enjeux_depuis_cumul_v2(NUMERIC, NUMERIC, NUMERIC)
  IS 'Enjeu quotidien reconstitué par différence de CUMUL_ENJEUX ; un recul du cumul est traité comme une remise à zéro du compteur.';

-- Recalcule un mois de cache pour un terminal. Cette fonction est appelée par
-- les déclencheurs par instruction afin de rester efficace lors des imports par lots.
CREATE OR REPLACE FUNCTION public.refresh_mobi_enjeux_month_v2(
  p_terminal TEXT, p_month DATE
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_month)::DATE;
BEGIN
  DELETE FROM public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2"
  WHERE id_trm_mobi = p_terminal AND mois = v_month;

  INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (
    id_trm_mobi, mois, premiere_date, derniere_date, jours_remontes,
    jours_avec_enjeux, enjeux_periode, gain_periode, annulation_periode,
    cumul_enjeux_fin
  )
  WITH derived AS (
    SELECT suivi.*,
      public.mobi_enjeux_depuis_cumul_v2(
        suivi.cumul_enjeux,
        (SELECT previous.cumul_enjeux
         FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS previous
         WHERE previous.id_trm_mobi = suivi.id_trm_mobi
           AND previous.date_suivi < suivi.date_suivi
           AND previous.cumul_enjeux IS NOT NULL
         ORDER BY previous.date_suivi DESC LIMIT 1),
        suivi.enjeux_jour
      ) AS enjeux_calcule
    FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
    WHERE suivi.id_trm_mobi = p_terminal
      AND suivi.date_suivi >= v_month
      AND suivi.date_suivi < (v_month + INTERVAL '1 month')
  )
  SELECT p_terminal, v_month, min(date_suivi), max(date_suivi), count(*),
    count(*) FILTER (WHERE enjeux_calcule > 0),
    sum(enjeux_calcule), sum(COALESCE(gain, 0)), sum(COALESCE(annulation, 0)),
    (array_agg(cumul_enjeux ORDER BY date_suivi DESC)
      FILTER (WHERE cumul_enjeux IS NOT NULL))[1]
  FROM derived
  HAVING count(*) > 0;
END;
$$;

-- Le cache existant devient un cache des écarts quotidiens du cumul.
DELETE FROM public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2";

INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (
  id_trm_mobi, mois, premiere_date, derniere_date, jours_remontes,
  jours_avec_enjeux, enjeux_periode, gain_periode, annulation_periode,
  cumul_enjeux_fin
)
WITH cumulative_rows AS MATERIALIZED (
  SELECT suivi.id_trm_mobi, suivi.date_suivi, suivi.cumul_enjeux,
    lag(suivi.cumul_enjeux) OVER (
      PARTITION BY suivi.id_trm_mobi ORDER BY suivi.date_suivi
    ) AS cumul_precedent
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
  WHERE suivi.cumul_enjeux IS NOT NULL
),
derived AS MATERIALIZED (
  SELECT suivi.*,
    public.mobi_enjeux_depuis_cumul_v2(
      suivi.cumul_enjeux, cumulative_rows.cumul_precedent, suivi.enjeux_jour
    ) AS enjeux_calcule
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
  LEFT JOIN cumulative_rows
    ON cumulative_rows.id_trm_mobi = suivi.id_trm_mobi
   AND cumulative_rows.date_suivi = suivi.date_suivi
)
SELECT id_trm_mobi, date_trunc('month', date_suivi)::DATE,
  min(date_suivi), max(date_suivi), count(*),
  count(*) FILTER (WHERE enjeux_calcule > 0), sum(enjeux_calcule),
  sum(COALESCE(gain, 0)), sum(COALESCE(annulation, 0)),
  (array_agg(cumul_enjeux ORDER BY date_suivi DESC)
    FILTER (WHERE cumul_enjeux IS NOT NULL))[1]
FROM derived
GROUP BY id_trm_mobi, date_trunc('month', date_suivi)::DATE;

COMMENT ON COLUMN public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".enjeux_periode
  IS 'Somme mensuelle des écarts quotidiens reconstitués depuis CUMUL_ENJEUX.';

DROP TRIGGER IF EXISTS trg_cache_mobi_enjeux_monthly_v2
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";
DROP TRIGGER IF EXISTS trg_cache_mobi_enjeux_monthly_insert_v2
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";
DROP TRIGGER IF EXISTS trg_cache_mobi_enjeux_monthly_update_v2
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";
DROP TRIGGER IF EXISTS trg_cache_mobi_enjeux_monthly_delete_v2
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_insert_v2()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target RECORD;
BEGIN
  FOR target IN
    SELECT DISTINCT changed.id_trm_mobi, months.mois
    FROM new_rows AS changed
    CROSS JOIN LATERAL (VALUES
      (date_trunc('month', changed.date_suivi)::DATE),
      ((date_trunc('month', changed.date_suivi) + INTERVAL '1 month')::DATE)
    ) AS months(mois)
  LOOP
    PERFORM public.refresh_mobi_enjeux_month_v2(target.id_trm_mobi, target.mois);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_update_v2()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target RECORD;
BEGIN
  FOR target IN
    WITH changed AS (
      SELECT id_trm_mobi, date_suivi FROM old_rows
      UNION
      SELECT id_trm_mobi, date_suivi FROM new_rows
    )
    SELECT DISTINCT changed.id_trm_mobi, months.mois
    FROM changed
    CROSS JOIN LATERAL (VALUES
      (date_trunc('month', changed.date_suivi)::DATE),
      ((date_trunc('month', changed.date_suivi) + INTERVAL '1 month')::DATE)
    ) AS months(mois)
  LOOP
    PERFORM public.refresh_mobi_enjeux_month_v2(target.id_trm_mobi, target.mois);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_delete_v2()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target RECORD;
BEGIN
  FOR target IN
    SELECT DISTINCT changed.id_trm_mobi, months.mois
    FROM old_rows AS changed
    CROSS JOIN LATERAL (VALUES
      (date_trunc('month', changed.date_suivi)::DATE),
      ((date_trunc('month', changed.date_suivi) + INTERVAL '1 month')::DATE)
    ) AS months(mois)
  LOOP
    PERFORM public.refresh_mobi_enjeux_month_v2(target.id_trm_mobi, target.mois);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_cache_mobi_enjeux_monthly_insert_v2
AFTER INSERT ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.cache_mobi_enjeux_monthly_insert_v2();

CREATE TRIGGER trg_cache_mobi_enjeux_monthly_update_v2
AFTER UPDATE ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.cache_mobi_enjeux_monthly_update_v2();

CREATE TRIGGER trg_cache_mobi_enjeux_monthly_delete_v2
AFTER DELETE ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.cache_mobi_enjeux_monthly_delete_v2();

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
  partial_daily AS MATERIALIZED (
    SELECT suivi.*,
      public.mobi_enjeux_depuis_cumul_v2(
        suivi.cumul_enjeux,
        (SELECT previous.cumul_enjeux
         FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS previous
         WHERE previous.id_trm_mobi = suivi.id_trm_mobi
           AND previous.date_suivi < suivi.date_suivi
           AND previous.cumul_enjeux IS NOT NULL
         ORDER BY previous.date_suivi DESC LIMIT 1),
        suivi.enjeux_jour
      ) AS enjeux_calcule
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
    WHERE (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      AND ((p_date_from IS NOT NULL AND p_date_from > date_trunc('month', suivi.date_suivi)::DATE)
        OR (p_date_to IS NOT NULL AND p_date_to < (date_trunc('month', suivi.date_suivi) + INTERVAL '1 month - 1 day')::DATE))
  ),
  partial_months AS (
    SELECT id_trm_mobi, min(date_suivi) AS premiere_date,
      max(date_suivi) AS derniere_date, count(*) AS jours_remontes,
      count(*) FILTER (WHERE enjeux_calcule > 0) AS jours_avec_enjeux,
      sum(enjeux_calcule) AS enjeux_periode,
      sum(COALESCE(gain, 0)) AS gain_periode,
      sum(COALESCE(annulation, 0)) AS annulation_periode
    FROM partial_daily
    GROUP BY id_trm_mobi, date_trunc('month', date_suivi)::DATE
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
  latest_as_of AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, snapshot.date_suivi,
      snapshot.cumul_enjeux,
      public.mobi_enjeux_depuis_cumul_v2(
        snapshot.cumul_enjeux, snapshot.cumul_precedent, snapshot.enjeux_jour
      ) AS dernier_enjeux_jour
    FROM requested
    JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.cumul_enjeux, suivi.enjeux_jour,
        (SELECT previous.cumul_enjeux
         FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS previous
         WHERE previous.id_trm_mobi = suivi.id_trm_mobi
           AND previous.date_suivi < suivi.date_suivi
           AND previous.cumul_enjeux IS NOT NULL
         ORDER BY previous.date_suivi DESC LIMIT 1) AS cumul_precedent
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      ORDER BY suivi.date_suivi DESC LIMIT 1
    ) AS snapshot ON TRUE
  )
  SELECT latest.id_trm_mobi, totals.premiere_date_periode, totals.derniere_date_periode,
    latest.date_suivi, COALESCE(totals.jours_remontes, 0), COALESCE(totals.jours_avec_enjeux, 0),
    COALESCE(totals.enjeux_periode, 0), latest.cumul_enjeux, latest.dernier_enjeux_jour,
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
  partial_daily AS MATERIALIZED (
    SELECT suivi.*,
      public.mobi_enjeux_depuis_cumul_v2(
        suivi.cumul_enjeux,
        (SELECT previous.cumul_enjeux
         FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS previous
         WHERE previous.id_trm_mobi = suivi.id_trm_mobi
           AND previous.date_suivi < suivi.date_suivi
           AND previous.cumul_enjeux IS NOT NULL
         ORDER BY previous.date_suivi DESC LIMIT 1),
        suivi.enjeux_jour
      ) AS enjeux_calcule
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('mois', 'annee')
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      AND ((p_date_from IS NOT NULL AND p_date_from > date_trunc('month', suivi.date_suivi)::DATE)
        OR (p_date_to IS NOT NULL AND p_date_to < (date_trunc('month', suivi.date_suivi) + INTERVAL '1 month - 1 day')::DATE))
  ),
  partial_months AS (
    SELECT id_trm_mobi, date_trunc('month', date_suivi)::DATE AS mois,
      sum(enjeux_calcule) AS enjeux_periode, count(*) AS jours_remontes
    FROM partial_daily
    GROUP BY id_trm_mobi, date_trunc('month', date_suivi)::DATE
  ),
  monthly_source AS (
    SELECT * FROM complete_months
    UNION ALL
    SELECT * FROM partial_months
  ),
  monthly_result AS (
    SELECT CASE WHEN p_granularity = 'annee'
        THEN date_trunc('year', source.mois)::DATE ELSE source.mois END AS periode,
      sum(source.enjeux_periode) AS enjeux_jour,
      count(DISTINCT source.id_trm_mobi)::BIGINT AS terminaux,
      max(source.jours_remontes)::BIGINT AS jours
    FROM monthly_source AS source
    GROUP BY CASE WHEN p_granularity = 'annee'
      THEN date_trunc('year', source.mois)::DATE ELSE source.mois END
  ),
  raw_actual AS MATERIALIZED (
    SELECT suivi.*
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      ON suivi.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('jour', 'semaine')
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
  ),
  raw_baseline AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, baseline.date_suivi,
      baseline.cumul_enjeux, baseline.enjeux_jour
    FROM requested
    JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.cumul_enjeux, suivi.enjeux_jour
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND p_date_from IS NOT NULL AND suivi.date_suivi < p_date_from
        AND suivi.cumul_enjeux IS NOT NULL
      ORDER BY suivi.date_suivi DESC LIMIT 1
    ) AS baseline ON TRUE
    WHERE p_granularity IN ('jour', 'semaine')
  ),
  raw_cumulative AS MATERIALIZED (
    SELECT source.id_trm_mobi, source.date_suivi, source.cumul_enjeux,
      lag(source.cumul_enjeux) OVER (
        PARTITION BY source.id_trm_mobi ORDER BY source.date_suivi
      ) AS cumul_precedent
    FROM (
      SELECT actual.id_trm_mobi, actual.date_suivi, actual.cumul_enjeux
      FROM raw_actual AS actual WHERE actual.cumul_enjeux IS NOT NULL
      UNION ALL
      SELECT baseline.id_trm_mobi, baseline.date_suivi, baseline.cumul_enjeux
      FROM raw_baseline AS baseline
    ) AS source
  ),
  raw_derived AS MATERIALIZED (
    SELECT actual.*,
      public.mobi_enjeux_depuis_cumul_v2(
        actual.cumul_enjeux, cumulative.cumul_precedent, actual.enjeux_jour
      ) AS enjeux_calcule,
      CASE WHEN p_granularity = 'jour' THEN actual.date_suivi
        ELSE date_trunc('week', actual.date_suivi)::DATE END AS periode
    FROM raw_actual AS actual
    LEFT JOIN raw_cumulative AS cumulative
      ON cumulative.id_trm_mobi = actual.id_trm_mobi
     AND cumulative.date_suivi = actual.date_suivi
  ),
  raw_result AS (
    SELECT raw_derived.periode, sum(raw_derived.enjeux_calcule) AS enjeux_jour,
      count(DISTINCT raw_derived.id_trm_mobi)::BIGINT AS terminaux,
      count(DISTINCT raw_derived.date_suivi)::BIGINT AS jours
    FROM raw_derived GROUP BY raw_derived.periode
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
          WHEN 'semaine' THEN totals.periode + 6
          WHEN 'annee' THEN (totals.periode + INTERVAL '1 year - 1 day')::DATE
          ELSE (totals.periode + INTERVAL '1 month - 1 day')::DATE END
      ELSE LEAST(p_date_to,
        CASE p_granularity
          WHEN 'jour' THEN totals.periode
          WHEN 'semaine' THEN totals.periode + 6
          WHEN 'annee' THEN (totals.periode + INTERVAL '1 year - 1 day')::DATE
          ELSE (totals.periode + INTERVAL '1 month - 1 day')::DATE END)
      END AS cutoff
    FROM period_totals AS totals
  ),
  terminal_periods AS MATERIALIZED (
    SELECT bounds.periode, bounds.cutoff, requested.reference
    FROM period_bounds AS bounds CROSS JOIN requested
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
        FILTER (WHERE suivi.cumul_enjeux IS NOT NULL))[1] AS cumul_enjeux
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
        THEN daily_state.cumul_enjeux ELSE monthly_state.cumul_enjeux END, 0)) AS cumul_enjeux
    FROM monthly_state JOIN daily_state USING (periode, reference)
    GROUP BY monthly_state.periode
  )
  SELECT bounds.periode, bounds.enjeux_jour,
    COALESCE(cumulative.cumul_enjeux, 0), bounds.terminaux, bounds.jours
  FROM period_bounds AS bounds
  LEFT JOIN period_cumulative AS cumulative USING (periode)
  ORDER BY bounds.periode;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  IS 'Synthèse par terminal ; enjeux de période reconstitués depuis les écarts quotidiens de CUMUL_ENJEUX.';
COMMENT ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  IS 'Série temporelle ; enjeux reconstitués quotidiennement depuis CUMUL_ENJEUX puis agrégés à la période demandée.';

NOTIFY pgrst, 'reload schema';
