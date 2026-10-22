-- La courbe financière doit être fondée sur la mesure métier ENJEUX_JOUR et
-- non sur CUMUL_ENJEUX ni sur sa variation reconstituée. Le cumul retourné ici
-- est donc le cumul des ENJEUX_JOUR de la fenêtre d'observation.

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
  actual AS MATERIALIZED (
    SELECT requested.reference AS id_trm_mobi, source.date_suivi,
      COALESCE(source.enjeux_jour, 0) AS enjeux_jour
    FROM requested
    CROSS JOIN LATERAL (
      SELECT suivi.date_suivi, suivi.enjeux_jour
      FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
      WHERE suivi.id_trm_mobi = requested.reference
        AND (p_date_from IS NULL OR suivi.date_suivi >= p_date_from)
        AND (p_date_to IS NULL OR suivi.date_suivi <= p_date_to)
      OFFSET 0
    ) AS source
  ),
  period_totals AS MATERIALIZED (
    SELECT CASE p_granularity
        WHEN 'jour' THEN actual.date_suivi
        WHEN 'semaine' THEN date_trunc('week', actual.date_suivi)::DATE
        WHEN 'annee' THEN date_trunc('year', actual.date_suivi)::DATE
        ELSE date_trunc('month', actual.date_suivi)::DATE
      END AS periode,
      sum(actual.enjeux_jour) AS enjeux_jour,
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
  SELECT period_totals.periode, period_totals.enjeux_jour,
    sum(period_totals.enjeux_jour) OVER (
      ORDER BY period_totals.periode
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumul_enjeux,
    period_totals.terminaux, period_totals.jours
  FROM period_totals
  ORDER BY period_totals.periode;
$$;

GRANT EXECUTE ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_mobi_enjeux_series_v2(TEXT[], DATE, DATE, TEXT)
  IS 'Série financière issue exclusivement de ENJEUX_JOUR, agrégée par jour, semaine, mois ou année.';

NOTIFY pgrst, 'reload schema';
