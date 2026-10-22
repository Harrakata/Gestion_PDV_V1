-- Cache mensuel par terminal pour les agrégats de rentabilité. Les mois
-- partiels restent calculés sur l'historique quotidien pour conserver
-- l'exactitude des filtres de dates.

CREATE TABLE IF NOT EXISTS public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (
  id_trm_mobi TEXT NOT NULL,
  mois DATE NOT NULL,
  premiere_date DATE NOT NULL,
  derniere_date DATE NOT NULL,
  jours_remontes BIGINT NOT NULL,
  jours_avec_enjeux BIGINT NOT NULL,
  enjeux_periode NUMERIC NOT NULL,
  gain_periode NUMERIC NOT NULL,
  annulation_periode NUMERIC NOT NULL,
  cumul_enjeux_fin NUMERIC,
  PRIMARY KEY (id_trm_mobi, mois)
);

CREATE INDEX IF NOT EXISTS idx_suivi_trm_mobi_enjeux_mensuel_v2_mois
  ON public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (mois, id_trm_mobi);

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
  count(*) FILTER (WHERE suivi.enjeux_jour IS NOT NULL),
  sum(COALESCE(suivi.enjeux_jour, 0)),
  sum(COALESCE(suivi.gain, 0)),
  sum(COALESCE(suivi.annulation, 0)),
  (array_agg(suivi.cumul_enjeux ORDER BY suivi.date_suivi DESC))[1]
FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
GROUP BY suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE
ON CONFLICT (id_trm_mobi, mois) DO UPDATE SET
  premiere_date = EXCLUDED.premiere_date,
  derniere_date = EXCLUDED.derniere_date,
  jours_remontes = EXCLUDED.jours_remontes,
  jours_avec_enjeux = EXCLUDED.jours_avec_enjeux,
  enjeux_periode = EXCLUDED.enjeux_periode,
  gain_periode = EXCLUDED.gain_periode,
  annulation_periode = EXCLUDED.annulation_periode,
  cumul_enjeux_fin = EXCLUDED.cumul_enjeux_fin;

CREATE OR REPLACE FUNCTION public.cache_mobi_enjeux_monthly_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_month DATE := date_trunc('month', NEW.date_suivi)::DATE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.id_trm_mobi = NEW.id_trm_mobi
     AND OLD.date_suivi = NEW.date_suivi THEN
    UPDATE public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS monthly
    SET jours_avec_enjeux = monthly.jours_avec_enjeux
          + (CASE WHEN NEW.enjeux_jour IS NULL THEN 0 ELSE 1 END)
          - (CASE WHEN OLD.enjeux_jour IS NULL THEN 0 ELSE 1 END),
        enjeux_periode = monthly.enjeux_periode
          + COALESCE(NEW.enjeux_jour, 0) - COALESCE(OLD.enjeux_jour, 0),
        gain_periode = monthly.gain_periode
          + COALESCE(NEW.gain, 0) - COALESCE(OLD.gain, 0),
        annulation_periode = monthly.annulation_periode
          + COALESCE(NEW.annulation, 0) - COALESCE(OLD.annulation, 0),
        cumul_enjeux_fin = CASE WHEN NEW.date_suivi = monthly.derniere_date
          THEN NEW.cumul_enjeux ELSE monthly.cumul_enjeux_fin END
    WHERE monthly.id_trm_mobi = NEW.id_trm_mobi
      AND monthly.mois = target_month;
    RETURN NEW;
  END IF;

  INSERT INTO public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" (
    id_trm_mobi, mois, premiere_date, derniere_date, jours_remontes,
    jours_avec_enjeux, enjeux_periode, gain_periode, annulation_periode,
    cumul_enjeux_fin
  ) VALUES (
    NEW.id_trm_mobi, target_month, NEW.date_suivi, NEW.date_suivi, 1,
    CASE WHEN NEW.enjeux_jour IS NULL THEN 0 ELSE 1 END,
    COALESCE(NEW.enjeux_jour, 0), COALESCE(NEW.gain, 0),
    COALESCE(NEW.annulation, 0), NEW.cumul_enjeux
  )
  ON CONFLICT (id_trm_mobi, mois) DO UPDATE SET
    premiere_date = LEAST(public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".premiere_date, EXCLUDED.premiere_date),
    derniere_date = GREATEST(public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".derniere_date, EXCLUDED.derniere_date),
    jours_remontes = public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".jours_remontes + 1,
    jours_avec_enjeux = public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".jours_avec_enjeux + EXCLUDED.jours_avec_enjeux,
    enjeux_periode = public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".enjeux_periode + EXCLUDED.enjeux_periode,
    gain_periode = public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".gain_periode + EXCLUDED.gain_periode,
    annulation_periode = public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".annulation_periode + EXCLUDED.annulation_periode,
    cumul_enjeux_fin = CASE
      WHEN EXCLUDED.derniere_date >= public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".derniere_date
      THEN EXCLUDED.cumul_enjeux_fin
      ELSE public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2".cumul_enjeux_fin
    END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cache_mobi_enjeux_monthly_v2
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";
CREATE TRIGGER trg_cache_mobi_enjeux_monthly_v2
AFTER INSERT OR UPDATE ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
FOR EACH ROW EXECUTE FUNCTION public.cache_mobi_enjeux_monthly_v2();

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
    SELECT unnest(p_terminal_references) AS reference WHERE p_terminal_references IS NOT NULL
    UNION ALL
    SELECT id_trm_mobi FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" WHERE p_terminal_references IS NULL
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
    JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi ON suivi.id_trm_mobi = requested.reference
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
  )
  SELECT latest.id_trm_mobi, totals.premiere_date_periode, totals.derniere_date_periode,
    latest.date_suivi, COALESCE(totals.jours_remontes, 0), COALESCE(totals.jours_avec_enjeux, 0),
    COALESCE(totals.enjeux_periode, 0), latest.cumul_enjeux, latest.enjeux_jour,
    COALESCE(totals.gain_periode, 0), COALESCE(totals.annulation_periode, 0)
  FROM requested
  JOIN public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest ON latest.id_trm_mobi = requested.reference
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
    SELECT unnest(p_terminal_references) AS reference WHERE p_terminal_references IS NOT NULL
    UNION ALL
    SELECT id_trm_mobi FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" WHERE p_terminal_references IS NULL
  ),
  complete_months AS (
    SELECT monthly.id_trm_mobi, monthly.mois, monthly.enjeux_periode,
      monthly.cumul_enjeux_fin, monthly.jours_remontes
    FROM requested JOIN public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" AS monthly
      ON monthly.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('mois', 'annee')
      AND (p_date_from IS NULL OR p_date_from <= monthly.mois)
      AND (p_date_to IS NULL OR p_date_to >= (monthly.mois + INTERVAL '1 month - 1 day')::DATE)
  ),
  partial_months AS (
    SELECT suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE AS mois,
      sum(COALESCE(suivi.enjeux_jour, 0)) AS enjeux_periode,
      (array_agg(suivi.cumul_enjeux ORDER BY suivi.date_suivi DESC))[1] AS cumul_enjeux_fin,
      count(*) AS jours_remontes
    FROM requested JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi ON suivi.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('mois', 'annee')
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      AND ((p_date_from IS NOT NULL AND p_date_from > date_trunc('month', suivi.date_suivi)::DATE)
        OR (p_date_to IS NOT NULL AND p_date_to < (date_trunc('month', suivi.date_suivi) + INTERVAL '1 month - 1 day')::DATE))
    GROUP BY suivi.id_trm_mobi, date_trunc('month', suivi.date_suivi)::DATE
  ),
  monthly_source AS (SELECT * FROM complete_months UNION ALL SELECT * FROM partial_months),
  monthly_terminal_period AS (
    SELECT source.id_trm_mobi,
      CASE WHEN p_granularity = 'annee' THEN date_trunc('year', source.mois)::DATE ELSE source.mois END AS periode,
      sum(source.enjeux_periode) AS enjeux_jour,
      (array_agg(source.cumul_enjeux_fin ORDER BY source.mois DESC))[1] AS cumul_enjeux,
      sum(source.jours_remontes) AS jours
    FROM monthly_source AS source GROUP BY source.id_trm_mobi,
      CASE WHEN p_granularity = 'annee' THEN date_trunc('year', source.mois)::DATE ELSE source.mois END
  ),
  monthly_result AS (
    SELECT monthly_terminal_period.periode, sum(monthly_terminal_period.enjeux_jour) AS enjeux_jour,
      sum(COALESCE(monthly_terminal_period.cumul_enjeux, 0)) AS cumul_enjeux,
      count(*)::BIGINT AS terminaux, max(monthly_terminal_period.jours)::BIGINT AS jours
    FROM monthly_terminal_period GROUP BY monthly_terminal_period.periode
  ),
  raw_scoped AS (
    SELECT suivi.*,
      CASE WHEN p_granularity = 'jour' THEN suivi.date_suivi
        ELSE date_trunc('week', suivi.date_suivi)::DATE END AS periode
    FROM requested JOIN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi ON suivi.id_trm_mobi = requested.reference
    WHERE p_granularity IN ('jour', 'semaine')
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
  ),
  raw_latest AS (
    SELECT DISTINCT ON (raw_scoped.periode, raw_scoped.id_trm_mobi)
      raw_scoped.periode, raw_scoped.id_trm_mobi, raw_scoped.cumul_enjeux
    FROM raw_scoped ORDER BY raw_scoped.periode, raw_scoped.id_trm_mobi, raw_scoped.date_suivi DESC
  ),
  raw_result AS (
    SELECT raw_scoped.periode, sum(COALESCE(raw_scoped.enjeux_jour, 0)) AS enjeux_jour,
      (SELECT sum(COALESCE(raw_latest.cumul_enjeux, 0)) FROM raw_latest WHERE raw_latest.periode = raw_scoped.periode) AS cumul_enjeux,
      count(DISTINCT raw_scoped.id_trm_mobi)::BIGINT AS terminaux,
      count(DISTINCT raw_scoped.date_suivi)::BIGINT AS jours
    FROM raw_scoped GROUP BY raw_scoped.periode
  )
  SELECT * FROM monthly_result
  UNION ALL
  SELECT * FROM raw_result
  ORDER BY periode;
$$;

REVOKE ALL ON TABLE public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" FROM anon, authenticated;
GRANT ALL ON TABLE public."SUIVI_TRM_MOBI_ENJEUX_MENSUEL_V2" TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
