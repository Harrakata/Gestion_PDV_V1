-- ============================================================
-- Nouvelles catégories de sous-ensembles
-- À exécuter dans Supabase SQL Editor
-- ============================================================
-- Ajoute les tables equipments_* et les colonnes d'affectation
-- sur terminaux pour les catégories :
-- - Bouton marche/arrêt
-- - Afficheur
-- - Circuit afficheur client
-- - Circuit BAC UC
-- - Carte mère BAC UC
-- - SSD
-- ============================================================

DO $$
DECLARE
  equipment RECORD;
  constraint_name TEXT;
  trigger_name TEXT;
BEGIN
  FOR equipment IN
    SELECT * FROM (
      VALUES
        ('equipments_boutons_marche_arret', 'bouton_marche_arret_reference', 'Boutons marche/arrêt'),
        ('equipments_afficheurs_terminal', 'afficheur_terminal_reference', 'Afficheurs'),
        ('equipments_circuits_afficheur_client', 'circuit_afficheur_client_reference', 'Circuits afficheur client'),
        ('equipments_circuits_bac_uc', 'circuit_bac_uc_reference', 'Circuits BAC UC'),
        ('equipments_cartes_meres_bac_uc', 'carte_mere_bac_uc_reference', 'Cartes mère BAC UC'),
        ('equipments_ssd', 'ssd_reference', 'SSD')
    ) AS items(table_name, terminal_column, label)
  LOOP
    constraint_name := equipment.table_name || '_statut_check';
    trigger_name := 'handle_' || equipment.table_name || '_updated_at';

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (
        id BIGSERIAL PRIMARY KEY,
        reference TEXT UNIQUE NOT NULL,
        modele TEXT NOT NULL,
        marque TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT ''Disponible'',
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone(''utc''::text, now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone(''utc''::text, now()) NOT NULL
      )',
      equipment.table_name
    );

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (statut IN (''Disponible'', ''En service'', ''En panne'', ''En maintenance'', ''Hors service''))',
        equipment.table_name,
        constraint_name
      );
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(reference)', 'idx_' || equipment.table_name || '_reference', equipment.table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(statut)', 'idx_' || equipment.table_name || '_statut', equipment.table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', equipment.table_name);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = equipment.table_name
        AND policyname = 'Enable all operations for authenticated users'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Enable all operations for authenticated users" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')',
        equipment.table_name
      );
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, equipment.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()',
      trigger_name,
      equipment.table_name
    );

    EXECUTE format('COMMENT ON TABLE public.%I IS %L', equipment.table_name, 'Table des ' || equipment.label || ' disponibles pour les terminaux');
    EXECUTE format('ALTER TABLE public.terminaux ADD COLUMN IF NOT EXISTS %I TEXT', equipment.terminal_column);
    EXECUTE format('COMMENT ON COLUMN public.terminaux.%I IS %L', equipment.terminal_column, 'Référence ' || equipment.label || ' affectée au terminal');
  END LOOP;
END $$;

-- ============================================================
-- Stock des terminaux assemblés
-- ============================================================
-- Un terminal assemblé regroupe les références de sous-ensembles
-- déjà montés. À l'affectation, l'enregistrement pointe vers
-- l'agence et le terminal configuré dans le parc.

CREATE TABLE IF NOT EXISTS public.terminaux_assembles (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  mac_address TEXT,
  identifiant TEXT,
  numero_secu TEXT,
  type_terminal TEXT NOT NULL DEFAULT '2020',
  adresse_ip TEXT,
  imprimante_reference TEXT,
  lecteur_reference TEXT,
  ecran_reference TEXT,
  afficheur_reference TEXT,
  buc_reference TEXT,
  carrosserie_reference TEXT,
  alimentation_reference TEXT,
  bouton_marche_arret_reference TEXT,
  afficheur_terminal_reference TEXT,
  circuit_afficheur_client_reference TEXT,
  circuit_bac_uc_reference TEXT,
  carte_mere_bac_uc_reference TEXT,
  ssd_reference TEXT,
  statut TEXT NOT NULL DEFAULT 'Disponible',
  agence_id UUID,
  terminal_id UUID,
  assigned_at TIMESTAMP WITH TIME ZONE,
  commentaire TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS mac_address TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS identifiant TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS numero_secu TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS ecran_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS alimentation_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS buc_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS lecteur_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS bouton_marche_arret_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS afficheur_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS imprimante_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS circuit_afficheur_client_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS circuit_bac_uc_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS carte_mere_bac_uc_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS ssd_reference TEXT;
ALTER TABLE public.terminaux_assembles ADD COLUMN IF NOT EXISTS afficheur_terminal_reference TEXT;

-- Les agences et les terminaux utilisent des UUID. Cette remise en conformité
-- permet aussi de relancer une première version créée avec des BIGINT.
DO $$
DECLARE
  agence_id_type TEXT;
  terminal_id_type TEXT;
BEGIN
  SELECT data_type
  INTO agence_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'terminaux_assembles'
    AND column_name = 'agence_id';

  IF agence_id_type IS DISTINCT FROM 'uuid' THEN
    IF EXISTS (
      SELECT 1
      FROM public.terminaux_assembles
      WHERE agence_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'Impossible de convertir terminaux_assembles.agence_id en UUID : la colonne contient déjà des valeurs.';
    END IF;

    ALTER TABLE public.terminaux_assembles
      DROP CONSTRAINT IF EXISTS terminaux_assembles_agence_id_fkey;
    ALTER TABLE public.terminaux_assembles
      ALTER COLUMN agence_id TYPE UUID USING NULL::UUID;
  END IF;

  SELECT data_type
  INTO terminal_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'terminaux_assembles'
    AND column_name = 'terminal_id';

  IF terminal_id_type IS DISTINCT FROM 'uuid' THEN
    IF EXISTS (
      SELECT 1
      FROM public.terminaux_assembles
      WHERE terminal_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'Impossible de convertir terminaux_assembles.terminal_id en UUID : la colonne contient déjà des valeurs.';
    END IF;

    ALTER TABLE public.terminaux_assembles
      DROP CONSTRAINT IF EXISTS terminaux_assembles_terminal_id_fkey;
    ALTER TABLE public.terminaux_assembles
      ALTER COLUMN terminal_id TYPE UUID USING NULL::UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.terminaux_assembles'::regclass
      AND conname = 'terminaux_assembles_agence_id_fkey'
  ) THEN
    ALTER TABLE public.terminaux_assembles
      ADD CONSTRAINT terminaux_assembles_agence_id_fkey
      FOREIGN KEY (agence_id) REFERENCES public.agences(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.terminaux_assembles'::regclass
      AND conname = 'terminaux_assembles_terminal_id_fkey'
  ) THEN
    ALTER TABLE public.terminaux_assembles
      ADD CONSTRAINT terminaux_assembles_terminal_id_fkey
      FOREIGN KEY (terminal_id) REFERENCES public.terminaux(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terminaux_assembles_statut_check'
  ) THEN
    ALTER TABLE public.terminaux_assembles
      ADD CONSTRAINT terminaux_assembles_statut_check
      CHECK (statut IN ('Disponible', 'Assigné'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_terminaux_assembles_reference ON public.terminaux_assembles(reference);
CREATE INDEX IF NOT EXISTS idx_terminaux_assembles_statut ON public.terminaux_assembles(statut);
CREATE INDEX IF NOT EXISTS idx_terminaux_assembles_agence_id ON public.terminaux_assembles(agence_id);
CREATE INDEX IF NOT EXISTS idx_terminaux_assembles_terminal_id ON public.terminaux_assembles(terminal_id);

ALTER TABLE public.terminaux_assembles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'terminaux_assembles'
      AND policyname = 'Enable all operations for authenticated users'
  ) THEN
    CREATE POLICY "Enable all operations for authenticated users"
      ON public.terminaux_assembles
      FOR ALL
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DROP TRIGGER IF EXISTS handle_terminaux_assembles_updated_at ON public.terminaux_assembles;
CREATE TRIGGER handle_terminaux_assembles_updated_at
  BEFORE UPDATE ON public.terminaux_assembles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.terminaux_assembles IS 'Stock des terminaux déjà assemblés avec leurs sous-ensembles référencés';
