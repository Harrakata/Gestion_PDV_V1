-- Cache relationnel du dernier état par terminal.
-- L'historique quotidien reste la source de vérité ; le trigger maintient ce
-- cache à chaque insertion ou mise à jour afin de servir l'application vite.

CREATE TABLE IF NOT EXISTS public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" (
  LIKE public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" INCLUDING DEFAULTS
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suivi_trm_mobi_dernier_etat_v2_terminal
  ON public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" (id_trm_mobi);

INSERT INTO public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2"
SELECT DISTINCT ON (suivi.id_trm_mobi)
  suivi.*
FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" AS suivi
ORDER BY suivi.id_trm_mobi, suivi.date_suivi DESC
ON CONFLICT (id_trm_mobi) DO UPDATE SET
  date_suivi = EXCLUDED.date_suivi,
  age_d_utilisation = EXCLUDED.age_d_utilisation,
  premiere_utilisation = EXCLUDED.premiere_utilisation,
  derniere_utilisation = EXCLUDED.derniere_utilisation,
  hors_service = EXCLUDED.hors_service,
  enjeux_jour = EXCLUDED.enjeux_jour,
  cumul_enjeux = EXCLUDED.cumul_enjeux,
  client = EXCLUDED.client,
  premier_prepose = EXCLUDED.premier_prepose,
  dernier_prepose = EXCLUDED.dernier_prepose,
  nbre_mobi = EXCLUDED.nbre_mobi,
  enjeux = EXCLUDED.enjeux,
  liste_prepose_du_jour = EXCLUDED.liste_prepose_du_jour,
  gain = EXCLUDED.gain,
  annulation = EXCLUDED.annulation
WHERE EXCLUDED.date_suivi >= public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2".date_suivi;

CREATE OR REPLACE FUNCTION public.cache_latest_suivi_trm_mobi_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" (
    date_suivi,
    id_trm_mobi,
    age_d_utilisation,
    premiere_utilisation,
    derniere_utilisation,
    hors_service,
    enjeux_jour,
    cumul_enjeux,
    client,
    premier_prepose,
    dernier_prepose,
    nbre_mobi,
    enjeux,
    liste_prepose_du_jour,
    gain,
    annulation
  ) VALUES (
    NEW.date_suivi,
    NEW.id_trm_mobi,
    NEW.age_d_utilisation,
    NEW.premiere_utilisation,
    NEW.derniere_utilisation,
    NEW.hors_service,
    NEW.enjeux_jour,
    NEW.cumul_enjeux,
    NEW.client,
    NEW.premier_prepose,
    NEW.dernier_prepose,
    NEW.nbre_mobi,
    NEW.enjeux,
    NEW.liste_prepose_du_jour,
    NEW.gain,
    NEW.annulation
  )
  ON CONFLICT (id_trm_mobi) DO UPDATE SET
    date_suivi = EXCLUDED.date_suivi,
    age_d_utilisation = EXCLUDED.age_d_utilisation,
    premiere_utilisation = EXCLUDED.premiere_utilisation,
    derniere_utilisation = EXCLUDED.derniere_utilisation,
    hors_service = EXCLUDED.hors_service,
    enjeux_jour = EXCLUDED.enjeux_jour,
    cumul_enjeux = EXCLUDED.cumul_enjeux,
    client = EXCLUDED.client,
    premier_prepose = EXCLUDED.premier_prepose,
    dernier_prepose = EXCLUDED.dernier_prepose,
    nbre_mobi = EXCLUDED.nbre_mobi,
    enjeux = EXCLUDED.enjeux,
    liste_prepose_du_jour = EXCLUDED.liste_prepose_du_jour,
    gain = EXCLUDED.gain,
    annulation = EXCLUDED.annulation
  WHERE EXCLUDED.date_suivi >= public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2".date_suivi;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cache_latest_suivi_trm_mobi_v2
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";

CREATE TRIGGER trg_cache_latest_suivi_trm_mobi_v2
AFTER INSERT OR UPDATE ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
FOR EACH ROW
EXECUTE FUNCTION public.cache_latest_suivi_trm_mobi_v2();

CREATE OR REPLACE FUNCTION public.get_latest_suivi_trm_mobi_v2(
  p_terminal_references TEXT[] DEFAULT NULL
)
RETURNS SETOF public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT latest_state.*
  FROM public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" AS latest_state
  WHERE p_terminal_references IS NULL
     OR latest_state.id_trm_mobi = ANY (p_terminal_references)
  ORDER BY latest_state.id_trm_mobi;
$$;

REVOKE ALL ON TABLE public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" FROM anon, authenticated;
GRANT ALL ON TABLE public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2" TO service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  TO anon, authenticated, service_role;

COMMENT ON TABLE public."SUIVI_TRM_MOBI_DERNIER_ETAT_V2"
  IS 'Cache technique maintenu automatiquement : dernier état connu de chaque terminal Mobi.';

NOTIFY pgrst, 'reload schema';
