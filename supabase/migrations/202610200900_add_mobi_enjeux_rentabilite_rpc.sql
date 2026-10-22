-- Agrégats de rentabilité Mobi fondés sur les enjeux quotidiens.
-- Le cumul est lu une seule fois par terminal depuis le cache du dernier état.

CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_terminal_summary_v2(
  p_terminal_references TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  id_trm_mobi TEXT,
  premiere_date_periode DATE,
  derniere_date_periode DATE,
  date_dernier_etat DATE,
  jours_remontes BIGINT,
  jours_avec_enjeux BIGINT,
  enjeux_periode NUMERIC,
  cumul_enjeux NUMERIC,
  dernier_enjeux_jour NUMERIC,
  gain_periode NUMERIC,
  annulation_periode NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH period_totals AS (
    SELECT
      suivi.id_trm_mobi,
      min(suivi.date_suivi) AS premiere_date_periode,
      max(suivi.date_suivi) AS derniere_date_periode,
      count(*) AS jours_remontes,
      count(*) FILTER (WHERE suivi.enjeux_jour IS NOT NULL) AS jours_avec_enjeux,
      sum(COALESCE(suivi.enjeux_jour, 0)) AS enjeux_periode,
      sum(COALESCE(suivi.gain, 0)) AS gain_periode,
      sum(COALESCE(suivi.annulation, 0)) AS annulation_periode
    FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
    WHERE (p_terminal_references IS NULL OR suivi.id_trm_mobi = ANY (p_terminal_references))
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
    GROUP BY suivi.id_trm_mobi
  )
  SELECT
    latest.id_trm_mobi,
    period.premiere_date_periode,
    period.derniere_date_periode,
    latest.date_suivi AS date_dernier_etat,
    COALESCE(period.jours_remontes, 0)::BIGINT,
    COALESCE(period.jours_avec_enjeux, 0)::BIGINT,
    COALESCE(period.enjeux_periode, 0),
    latest.cumul_enjeux,
    latest.enjeux_jour AS dernier_enjeux_jour,
    COALESCE(period.gain_periode, 0),
    COALESCE(period.annulation_periode, 0)
  FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest
  LEFT JOIN period_totals AS period USING (id_trm_mobi)
  WHERE p_terminal_references IS NULL OR latest.id_trm_mobi = ANY (p_terminal_references)
  ORDER BY latest.id_trm_mobi;
$$;

CREATE OR REPLACE FUNCTION public.get_mobi_enjeux_series_v2(
  p_terminal_references TEXT[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_granularity TEXT DEFAULT 'mois'
)
RETURNS TABLE (
  periode DATE,
  enjeux_jour NUMERIC,
  cumul_enjeux NUMERIC,
  terminaux BIGINT,
  jours BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      suivi.*,
      CASE p_granularity
        WHEN 'jour' THEN suivi.date_suivi
        WHEN 'semaine' THEN date_trunc('week', suivi.date_suivi)::DATE
        WHEN 'annee' THEN date_trunc('year', suivi.date_suivi)::DATE
        ELSE date_trunc('month', suivi.date_suivi)::DATE
      END AS periode
    FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
    WHERE (p_terminal_references IS NULL OR suivi.id_trm_mobi = ANY (p_terminal_references))
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
  ),
  period_totals AS (
    SELECT
      scoped.periode,
      sum(COALESCE(scoped.enjeux_jour, 0)) AS enjeux_jour,
      count(DISTINCT scoped.id_trm_mobi) AS terminaux,
      count(DISTINCT scoped.date_suivi) AS jours
    FROM scoped
    GROUP BY scoped.periode
  ),
  latest_terminal_period AS (
    SELECT DISTINCT ON (scoped.periode, scoped.id_trm_mobi)
      scoped.periode,
      scoped.id_trm_mobi,
      scoped.cumul_enjeux
    FROM scoped
    ORDER BY scoped.periode, scoped.id_trm_mobi, scoped.date_suivi DESC
  ),
  period_cumulative AS (
    SELECT
      latest_terminal_period.periode,
      sum(COALESCE(latest_terminal_period.cumul_enjeux, 0)) AS cumul_enjeux
    FROM latest_terminal_period
    GROUP BY latest_terminal_period.periode
  )
  SELECT
    totals.periode,
    totals.enjeux_jour,
    cumulative.cumul_enjeux,
    totals.terminaux,
    totals.jours
  FROM period_totals AS totals
  JOIN period_cumulative AS cumulative USING (periode)
  ORDER BY totals.periode;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  IS 'Synthèse des enjeux par terminal sur une période, avec cumul issu du dernier état connu.';
COMMENT ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  IS 'Série temporelle agrégée des enjeux journaliers et cumulés pour la rentabilité Mobi.';

NOTIFY pgrst, 'reload schema';
