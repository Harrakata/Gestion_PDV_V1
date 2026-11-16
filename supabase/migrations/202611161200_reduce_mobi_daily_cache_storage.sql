-- Le cache quotidien recopiait une ligne pour chaque ligne de l'historique
-- Mobi. Il doublait donc presque le volume des donnees et de leur cle primaire.
-- Les indicateurs financiers utilisent desormais ENJEUX_JOUR comme source de
-- verite ; le petit cache mensuel suffit pour accelerer les syntheses.

-- Maintient le cache mensuel directement depuis les mesures metier de la table
-- source. Un recalcul par terminal/mois reste peu couteux lors des imports par
-- lots et gere correctement INSERT, UPDATE et DELETE.
CREATE OR REPLACE FUNCTION public.refresh_mobi_enjeux_month_v2(
  p_terminal TEXT, p_month DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_month)::DATE;
BEGIN
  DELETE FROM public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2"
  WHERE id_trm_mobi = p_terminal
    AND mois = v_month;

  INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (
    id_trm_mobi, mois, premiere_date, derniere_date, jours_remontes,
    jours_avec_enjeux, enjeux_periode, gain_periode, annulation_periode,
    cumul_enjeux_fin
  )
  SELECT
    p_terminal,
    v_month,
    min(suivi.date_suivi),
    max(suivi.date_suivi),
    count(*),
    count(*) FILTER (WHERE COALESCE(suivi.enjeux_jour, 0) > 0),
    sum(COALESCE(suivi.enjeux_jour, 0)),
    sum(COALESCE(suivi.gain, 0)),
    sum(COALESCE(suivi.annulation, 0)),
    (array_agg(suivi.cumul_enjeux ORDER BY suivi.date_suivi DESC)
      FILTER (WHERE suivi.cumul_enjeux IS NOT NULL))[1]
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
  WHERE suivi.id_trm_mobi = p_terminal
    AND suivi.date_suivi >= v_month
    AND suivi.date_suivi < (v_month + INTERVAL '1 month')
  HAVING count(*) > 0;
END;
$$;

-- Corrige le contenu historique du petit cache mensuel avant de retirer le
-- cache quotidien volumineux.
TRUNCATE TABLE public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2";

INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (
  id_trm_mobi, mois, premiere_date, derniere_date, jours_remontes,
  jours_avec_enjeux, enjeux_periode, gain_periode, annulation_periode,
  cumul_enjeux_fin
)
SELECT
  suivi.id_trm_mobi,
  date_trunc('month', suivi.date_suivi)::DATE,
  min(suivi.date_suivi),
  max(suivi.date_suivi),
  count(*),
  count(*) FILTER (WHERE COALESCE(suivi.enjeux_jour, 0) > 0),
  sum(COALESCE(suivi.enjeux_jour, 0)),
  sum(COALESCE(suivi.gain, 0)),
  sum(COALESCE(suivi.annulation, 0)),
  (array_agg(suivi.cumul_enjeux ORDER BY suivi.date_suivi DESC)
    FILTER (WHERE suivi.cumul_enjeux IS NOT NULL))[1]
FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
GROUP BY suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE;

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_insert_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target RECORD;
BEGIN
  FOR target IN
    SELECT DISTINCT changed.id_trm_mobi,
      date_trunc('month', changed.date_suivi)::DATE AS mois
    FROM new_rows AS changed
  LOOP
    PERFORM public.refresh_mobi_enjeux_month_v2(
      target.id_trm_mobi, target.mois
    );
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_update_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target RECORD;
BEGIN
  FOR target IN
    WITH changed AS (
      SELECT id_trm_mobi, date_suivi FROM old_rows
      UNION
      SELECT id_trm_mobi, date_suivi FROM new_rows
    )
    SELECT DISTINCT changed.id_trm_mobi,
      date_trunc('month', changed.date_suivi)::DATE AS mois
    FROM changed
  LOOP
    PERFORM public.refresh_mobi_enjeux_month_v2(
      target.id_trm_mobi, target.mois
    );
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_delete_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target RECORD;
BEGIN
  FOR target IN
    SELECT DISTINCT changed.id_trm_mobi,
      date_trunc('month', changed.date_suivi)::DATE AS mois
    FROM old_rows AS changed
  LOOP
    PERFORM public.refresh_mobi_enjeux_month_v2(
      target.id_trm_mobi, target.mois
    );
  END LOOP;
  RETURN NULL;
END;
$$;

-- Synthese par terminal : cache mensuel pour les mois complets, table source
-- indexee pour les bornes partielles et le dernier etat a la date demandee.
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
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    SELECT monthly.id_trm_mobi, monthly.premiere_date,
      monthly.derniere_date, monthly.jours_remontes,
      monthly.jours_avec_enjeux, monthly.enjeux_periode,
      monthly.gain_periode, monthly.annulation_periode
    FROM requested
    CROSS JOIN LATERAL (
      SELECT cache.*
      FROM public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS cache
      WHERE cache.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR p_date_from <= cache.mois)
        AND (p_date_to IS NULL OR p_date_to >=
          (cache.mois + INTERVAL '1 month - 1 day')::DATE)
      OFFSET 0
    ) AS monthly
  ),
  partial_daily AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, daily.*
    FROM requested
    CROSS JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.enjeux_jour, suivi.gain,
        suivi.annulation
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
        AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
        AND (
          (p_date_from IS NOT NULL
            AND p_date_from > date_trunc('month', suivi.date_suivi)::DATE)
          OR
          (p_date_to IS NOT NULL
            AND p_date_to < (date_trunc('month', suivi.date_suivi)
              + INTERVAL '1 month - 1 day')::DATE)
        )
      OFFSET 0
    ) AS daily
  ),
  partial_months AS MATERIALIZED (
    SELECT partial_daily.id_trm_mobi,
      min(partial_daily.date_suivi) AS premiere_date,
      max(partial_daily.date_suivi) AS derniere_date,
      count(*)::BIGINT AS jours_remontes,
      count(*) FILTER (
        WHERE COALESCE(partial_daily.enjeux_jour, 0) > 0
      )::BIGINT AS jours_avec_enjeux,
      sum(COALESCE(partial_daily.enjeux_jour, 0)) AS enjeux_periode,
      sum(COALESCE(partial_daily.gain, 0)) AS gain_periode,
      sum(COALESCE(partial_daily.annulation, 0)) AS annulation_periode
    FROM partial_daily
    GROUP BY partial_daily.id_trm_mobi,
      date_trunc('month', partial_daily.date_suivi)::DATE
  ),
  totals AS MATERIALIZED (
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
      snapshot.cumul_enjeux, snapshot.enjeux_jour
    FROM requested
    CROSS JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.cumul_enjeux, suivi.enjeux_jour
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      ORDER BY suivi.date_suivi DESC
      LIMIT 1
    ) AS snapshot
  )
  SELECT latest.id_trm_mobi, totals.premiere_date_periode,
    totals.derniere_date_periode, latest.date_suivi,
    COALESCE(totals.jours_remontes, 0),
    COALESCE(totals.jours_avec_enjeux, 0),
    COALESCE(totals.enjeux_periode, 0), latest.cumul_enjeux,
    COALESCE(latest.enjeux_jour, 0),
    COALESCE(totals.gain_periode, 0),
    COALESCE(totals.annulation_periode, 0)
  FROM latest_as_of AS latest
  LEFT JOIN totals ON totals.id_trm_mobi = latest.id_trm_mobi
  ORDER BY latest.id_trm_mobi;
$$;

-- Courbe journaliere lue directement depuis ENJEUX_JOUR. Le front-end etend
-- deja cette serie creuse aux jours sans remontee.
CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_daily_curve_v2(
  p_terminal_references TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  periode DATE, enjeux_jour NUMERIC, cumul_enjeux NUMERIC,
  terminaux BIGINT, jours BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
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
  actual AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, daily.date_suivi,
      COALESCE(daily.enjeux_jour, 0) AS enjeux_jour
    FROM requested
    CROSS JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.enjeux_jour
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
        AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      OFFSET 0
    ) AS daily
  ),
  source_bounds AS MATERIALIZED (
    SELECT COALESCE(p_date_from, min(actual.date_suivi)) AS date_from,
      COALESCE(p_date_to, max(actual.date_suivi)) AS date_to
    FROM actual
  ),
  daily_totals AS MATERIALIZED (
    SELECT actual.date_suivi AS day,
      sum(actual.enjeux_jour) AS enjeux_jour,
      count(DISTINCT actual.id_trm_mobi)::BIGINT AS terminaux
    FROM actual
    GROUP BY actual.date_suivi
  ),
  curve_days AS MATERIALIZED (
    SELECT source_bounds.date_from AS day FROM source_bounds
    UNION
    SELECT source_bounds.date_to AS day FROM source_bounds
    UNION
    SELECT daily_totals.day FROM daily_totals
  )
  SELECT curve_days.day AS periode,
    COALESCE(daily_totals.enjeux_jour, 0) AS enjeux_jour,
    sum(COALESCE(daily_totals.enjeux_jour, 0)) OVER (
      ORDER BY curve_days.day
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumul_enjeux,
    COALESCE(daily_totals.terminaux, 0)::BIGINT AS terminaux,
    1::BIGINT AS jours
  FROM curve_days
  LEFT JOIN daily_totals ON daily_totals.day = curve_days.day
  WHERE curve_days.day IS NOT NULL
  ORDER BY curve_days.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(
  TEXT[], DATE, DATE
) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(
  TEXT[], DATE, DATE
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(
  TEXT[], DATE, DATE
) IS 'Synthese Mobi depuis ENJEUX_JOUR : cache mensuel et source quotidienne pour les mois partiels.';
COMMENT ON FUNCTION public.get_mobi_enjeux_daily_curve_v2(
  TEXT[], DATE, DATE
) IS 'Serie quotidienne Mobi depuis ENJEUX_JOUR, sans cache quotidien duplique.';

-- Les fonctions consommatrices ne dependent plus de cette copie journaliere.
-- DROP TABLE libere immediatement le fichier de table et ses deux index.
DROP TABLE IF EXISTS public."SUIVI_TRM_MOBI_ENJEUX_QUOTIDIEN_CALC_V2";
DROP FUNCTION IF EXISTS public.refresh_mobi_enjeux_daily_month_v2(TEXT, DATE);

COMMENT ON TABLE public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2"
  IS 'Agregats mensuels compacts issus de ENJEUX_JOUR pour accelerer les syntheses Mobi.';

NOTIFY pgrst, 'reload schema';
