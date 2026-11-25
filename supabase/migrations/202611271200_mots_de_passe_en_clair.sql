-- ============================================================
-- Mots de passe en clair : effacement et interdiction
-- À exécuter dans Supabase SQL Editor (ou via migrate.sh)
-- ============================================================
--  D'anciens imports CSV enregistraient le mot de passe, lisible, dans la fiche de la
--  personne (colonnes mdp, mdpPrepose, motDePasse). La connexion ne s'en sert pas : elle
--  passe par Supabase Auth, qui garde ses propres mots de passe chiffrés (auth.users).
--
--  Cette migration :
--   1. efface ces valeurs (DÉFINITIF : pas de retour arrière) ;
--   2. installe un déclencheur qui vide ces colonnes à chaque enregistrement, y compris
--      depuis un appareil pas encore à jour ou un outil externe.
--  Les comptes de connexion et les autres colonnes ne changent pas. Les colonnes restent.
--
--  AVANT : lancer l'état des lieux de docs/MOTS-DE-PASSE.md (qui doit changer de mot de
--  passe). Après l'effacement, la comparaison n'est plus possible.
--
--  Migration idempotente.
-- ============================================================

-- Colonnes réellement présentes. Le nom diffère selon les clients (majuscules, anciens scripts).
CREATE OR REPLACE FUNCTION public.colonnes_mot_de_passe()
RETURNS TABLE (nom_table TEXT, nom_colonne TEXT)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT c.table_name::text, c.column_name::text
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.table_name IN ('guichetieres', 'chefs_agence', 'chefs_secteur', 'techniciens', 'profils_exploitation', 'validateurs_paiement_gain')
    AND lower(c.column_name) IN ('mdp', 'mdpprepose', 'motdepasse', 'mot_de_passe')
    AND c.data_type IN ('text', 'character varying', 'character')
$$;
REVOKE ALL ON FUNCTION public.colonnes_mot_de_passe() FROM PUBLIC;
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.colonnes_mot_de_passe() FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- TG_ARGV : colonnes à vider.
CREATE OR REPLACE FUNCTION public.vider_mot_de_passe()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RETURN jsonb_populate_record(NEW, (SELECT jsonb_object_agg(c, NULL) FROM unnest(TG_ARGV) c));
END
$$;

DO $$
DECLARE
  t RECORD;
  col TEXT;
BEGIN
  FOR t IN SELECT nom_table, array_agg(nom_colonne ORDER BY nom_colonne) AS colonnes FROM public.colonnes_mot_de_passe() GROUP BY nom_table LOOP
    FOREACH col IN ARRAY t.colonnes LOOP
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL, ALTER COLUMN %I DROP DEFAULT', t.nom_table, col, col);
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL', t.nom_table, col, col);
    END LOOP;
    -- « zz » : après les autres déclencheurs.
    EXECUTE format('DROP TRIGGER IF EXISTS zz_vider_mot_de_passe ON public.%I', t.nom_table);
    EXECUTE format('CREATE TRIGGER zz_vider_mot_de_passe BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW WHEN (%s) EXECUTE FUNCTION public.vider_mot_de_passe(%s)',
      t.nom_table,
      (SELECT string_agg(format('NEW.%I IS NOT NULL', c), ' OR ') FROM unnest(t.colonnes) c),
      (SELECT string_agg(quote_literal(c), ', ') FROM unnest(t.colonnes) c));
  END LOOP;
END
$$;

-- Contrôle : plus aucune valeur, et un déclencheur par table concernée.
DO $$
DECLARE
  t RECORD;
  n BIGINT;
BEGIN
  FOR t IN SELECT * FROM public.colonnes_mot_de_passe() LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS NOT NULL', t.nom_table, t.nom_colonne) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'Effacement incomplet : % valeur(s) dans %.%', n, t.nom_table, t.nom_colonne; END IF;
  END LOOP;
END
$$;

SELECT 'Mots de passe en clair effacés et interdits : '
  || coalesce((SELECT string_agg(nom_table || '.' || nom_colonne, ', ' ORDER BY nom_table) FROM public.colonnes_mot_de_passe()), 'aucune colonne concernée') AS resultat;
