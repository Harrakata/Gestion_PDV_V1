-- Historique quotidien des terminaux Mobi synchronisé depuis Power BI.
-- Le nom de table conserve la casse du modèle source ; les colonnes sont
-- normalisées en snake_case pour rester compatibles avec PostgREST.

CREATE TABLE IF NOT EXISTS public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" (
  date_suivi                 DATE NOT NULL,
  id_trm_mobi                TEXT NOT NULL,
  age_d_utilisation          INTEGER,
  premiere_utilisation       DATE,
  derniere_utilisation       DATE,
  hors_service               INTEGER,
  enjeux_jour                NUMERIC,
  cumul_enjeux               NUMERIC,
  client                     TEXT,
  premier_prepose            TEXT,
  dernier_prepose            TEXT,
  nbre_mobi                  INTEGER,
  enjeux                     NUMERIC,
  liste_prepose_du_jour      TEXT,
  gain                       NUMERIC,
  annulation                 NUMERIC,
  PRIMARY KEY (date_suivi, id_trm_mobi)
);

CREATE INDEX IF NOT EXISTS idx_suivi_trm_mobi_quotidien_v2_terminal_date
  ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" (id_trm_mobi, date_suivi DESC);

ALTER TABLE public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'SUIVI_TRM_MOBI_QUOTIDIEN_V2'
      AND policyname = 'Allow read access on SUIVI_TRM_MOBI_QUOTIDIEN_V2'
  ) THEN
    CREATE POLICY "Allow read access on SUIVI_TRM_MOBI_QUOTIDIEN_V2"
      ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
      FOR SELECT
      USING (auth.role() IN ('anon', 'authenticated'));
  END IF;
END $$;

GRANT SELECT ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" TO anon, authenticated;
GRANT ALL ON public."SUIVI_TRM_MOBI_QUOTIDIEN_V2" TO service_role;

COMMENT ON TABLE public."SUIVI_TRM_MOBI_QUOTIDIEN_V2"
  IS 'Instantanés quotidiens du suivi des terminaux Mobi, synchronisés depuis Power BI.';
COMMENT ON COLUMN public."SUIVI_TRM_MOBI_QUOTIDIEN_V2".age_d_utilisation
  IS 'Colonne source AGE_D''UTILISATION.';

-- Compatibilité avec l'indicateur de fraîcheur déjà affiché par les écrans Mobi.
CREATE OR REPLACE FUNCTION public.get_suivi_refresh_info()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'last_refresh', max(date_suivi)::timestamptz,
    'row_count', count(*)
  )
  FROM public."SUIVI_TRM_MOBI_QUOTIDIEN_V2";
$$;

GRANT EXECUTE ON FUNCTION public.get_suivi_refresh_info() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
