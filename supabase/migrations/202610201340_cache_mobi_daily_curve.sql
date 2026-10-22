-- Cache étroit des écarts quotidiens : la reconstruction depuis le cumul est
-- effectuée à l'import, pas à chaque affichage de la courbe.

CREATE TABLE IF NOT EXISTS public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" (
  id_trm_mobi TEXT NOT NULL,
  date_suivi DATE NOT NULL,
  enjeux_calcule NUMERIC NOT NULL DEFAULT 0,
  cumul_enjeux NUMERIC,
  variation_cumul NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (id_trm_mobi, date_suivi)
);

CREATE INDEX IF NOT EXISTS idx_mobi_enjeux_quotidien_calc_v2_date
  ON public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" (date_suivi);

ALTER TABLE public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" TO anon, authenticated;
GRANT ALL ON public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" TO service_role;

DELETE FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2";

INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" (
  id_trm_mobi, date_suivi, enjeux_calcule, cumul_enjeux, variation_cumul
)
WITH cumulative_rows AS MATERIALIZED (
  SELECT suivi.id_trm_mobi, suivi.date_suivi, suivi.cumul_enjeux,
    lag(suivi.cumul_enjeux) OVER (
      PARTITION BY suivi.id_trm_mobi ORDER BY suivi.date_suivi
    ) AS cumul_precedent
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
  WHERE suivi.cumul_enjeux IS NOT NULL
)
SELECT suivi.id_trm_mobi, suivi.date_suivi,
  public.mobi_enjeux_depuis_cumul_v2(
    suivi.cumul_enjeux, cumulative_rows.cumul_precedent, suivi.enjeux_jour
  ),
  suivi.cumul_enjeux,
  CASE WHEN suivi.cumul_enjeux IS NULL THEN 0
    ELSE suivi.cumul_enjeux - COALESCE(cumulative_rows.cumul_precedent, 0) END
FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
LEFT JOIN cumulative_rows
  ON cumulative_rows.id_trm_mobi = suivi.id_trm_mobi
 AND cumulative_rows.date_suivi = suivi.date_suivi;

CREATE OR REPLACE FUNCTION public.refresh_mobi_enjeux_daily_month_v2(
  p_terminal TEXT, p_month DATE
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_month)::DATE;
BEGIN
  DELETE FROM public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2"
  WHERE id_trm_mobi = p_terminal
    AND date_suivi >= v_month
    AND date_suivi < (v_month + INTERVAL '1 month');

  INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" (
    id_trm_mobi, date_suivi, enjeux_calcule, cumul_enjeux, variation_cumul
  )
  SELECT suivi.id_trm_mobi, suivi.date_suivi,
    public.mobi_enjeux_depuis_cumul_v2(
      suivi.cumul_enjeux, previous.cumul_enjeux, suivi.enjeux_jour
    ),
    suivi.cumul_enjeux,
    CASE WHEN suivi.cumul_enjeux IS NULL THEN 0
      ELSE suivi.cumul_enjeux - COALESCE(previous.cumul_enjeux, 0) END
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
  LEFT JOIN LATERAL (
    SELECT earlier.cumul_enjeux
    FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS earlier
    WHERE earlier.id_trm_mobi = suivi.id_trm_mobi
      AND earlier.date_suivi < suivi.date_suivi
      AND earlier.cumul_enjeux IS NOT NULL
    ORDER BY earlier.date_suivi DESC LIMIT 1
  ) AS previous ON TRUE
  WHERE suivi.id_trm_mobi = p_terminal
    AND suivi.date_suivi >= v_month
    AND suivi.date_suivi < (v_month + INTERVAL '1 month');
END;
$$;

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
    PERFORM public.refresh_mobi_enjeux_daily_month_v2(target.id_trm_mobi, target.mois);
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
    PERFORM public.refresh_mobi_enjeux_daily_month_v2(target.id_trm_mobi, target.mois);
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
    PERFORM public.refresh_mobi_enjeux_daily_month_v2(target.id_trm_mobi, target.mois);
  END LOOP;
  RETURN NULL;
END;
$$;

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
      COALESCE(p_date_from, min(cache.date_suivi)) AS date_from,
      COALESCE(p_date_to, max(cache.date_suivi)) AS date_to
    FROM requested
    JOIN public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
      ON cache.id_trm_mobi = requested.reference
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
    JOIN public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2" AS cache
      ON cache.id_trm_mobi = requested.reference
     AND cache.date_suivi >= source_bounds.date_from
     AND cache.date_suivi <= source_bounds.date_to
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

COMMENT ON TABLE public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2"
  IS 'Cache des enjeux journaliers reconstitués et des variations du cumul, maintenu à chaque import.';
COMMENT ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(TEXT[], DATE, DATE)
  IS 'Série quotidienne creuse lue depuis le cache des écarts de CUMUL_ENJEUX.';

NOTIFY pgrst, 'reload schema';
