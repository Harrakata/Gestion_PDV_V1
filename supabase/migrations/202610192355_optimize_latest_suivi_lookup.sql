-- Recherche indexée du dernier état à partir du référentiel maître.
-- On évite ainsi un DISTINCT ON parcourant les 448k+ lignes historiques.

CREATE OR REPLACE FUNCTION public.get_latest_suivi_trm_mobi_v2(
  p_terminal_references TEXT[] DEFAULT NULL
)
RETURNS SETOF public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested_references AS (
    SELECT unnest(p_terminal_references) AS reference
    WHERE p_terminal_references IS NOT NULL

    UNION ALL

    SELECT terminal.reference
    FROM public.terminaux_mobi AS terminal
    WHERE p_terminal_references IS NULL
  )
  SELECT latest_state.*
  FROM requested_references AS requested
  CROSS JOIN LATERAL (
    SELECT suivi.*
    FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
    WHERE suivi.id_trm_mobi = requested.reference
    ORDER BY suivi.date_suivi DESC
    LIMIT 1
  ) AS latest_state
  ORDER BY latest_state.id_trm_mobi;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  IS 'Retourne le dernier état connu de chaque terminal demandé via une recherche indexée.';

NOTIFY pgrst, 'reload schema';
