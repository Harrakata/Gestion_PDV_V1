-- ============================================================
-- Autorisations d'import des terminaux assemblés
-- ============================================================
-- L'application conserve temporairement deux modes de session :
-- - Supabase Auth, exposé avec le rôle authenticated ;
-- - les profils historiques, exposés avec le rôle anon.
-- Les droits fonctionnels restent contrôlés par l'application via canManage.

DO $$
DECLARE
  equipment_table TEXT;
BEGIN
  FOREACH equipment_table IN ARRAY ARRAY[
    'equipments_imprimantes',
    'equipments_ecrans',
    'equipments_lecteurs',
    'equipments_afficheurs',
    'equipments_bucs',
    'equipments_carrosseries',
    'equipments_alimentations',
    'equipments_boutons_marche_arret',
    'equipments_afficheurs_terminal',
    'equipments_circuits_afficheur_client',
    'equipments_circuits_bac_uc',
    'equipments_cartes_meres_bac_uc',
    'equipments_ssd',
    'terminaux_assembles'
  ]
  LOOP
    IF to_regclass(format('public.%I', equipment_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', equipment_table);
    EXECUTE format(
      'DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.%I',
      equipment_table
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS "Allow app access for equipment management" ON public.%I',
      equipment_table
    );
    EXECUTE format(
      'CREATE POLICY "Allow app access for equipment management" ON public.%I
       FOR ALL TO anon, authenticated
       USING (true)
       WITH CHECK (true)',
      equipment_table
    );
  END LOOP;
END $$;

