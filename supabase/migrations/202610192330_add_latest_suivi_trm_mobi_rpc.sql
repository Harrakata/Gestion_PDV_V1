-- Dernier état connu de chaque terminal Mobi.
-- Cette fonction évite de transférer les 448k+ lignes historiques au client.

CREATE OR REPLACE FUNCTION public.get_latest_suivi_trm_mobi_v2(
  p_terminal_references TEXT[] DEFAULT NULL
)
RETURNS SETOF public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (suivi.id_trm_mobi)
    suivi.*
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
  WHERE p_terminal_references IS NULL
     OR suivi.id_trm_mobi = ANY (p_terminal_references)
  ORDER BY suivi.id_trm_mobi, suivi.date_suivi DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  IS 'Retourne au plus une ligne par terminal : sa dernière remontée disponible.';

NOTIFY pgrst, 'reload schema';
