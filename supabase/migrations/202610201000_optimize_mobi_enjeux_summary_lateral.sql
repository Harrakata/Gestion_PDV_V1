-- La synthèse part du cache (1 ligne par terminal) puis effectue une recherche
-- latérale indexée dans l'historique pour chaque terminal demandé.

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
  LEFT JOIN LATERAL (
    SELECT
      min(suivi.date_suivi) AS premiere_date_periode,
      max(suivi.date_suivi) AS derniere_date_periode,
      count(*) AS jours_remontes,
      count(*) FILTER (WHERE suivi.enjeux_jour IS NOT NULL) AS jours_avec_enjeux,
      sum(COALESCE(suivi.enjeux_jour, 0)) AS enjeux_periode,
      sum(COALESCE(suivi.gain, 0)) AS gain_periode,
      sum(COALESCE(suivi.annulation, 0)) AS annulation_periode
    FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
    WHERE suivi.id_trm_mobi = latest.id_trm_mobi
      AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
      AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
  ) AS period ON TRUE
  WHERE p_terminal_references IS NULL
     OR latest.id_trm_mobi = ANY (p_terminal_references)
  ORDER BY latest.id_trm_mobi;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_terminal_summary_v2(TEXT[], DATE, DATE)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
