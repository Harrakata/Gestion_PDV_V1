-- ============================================================
-- Historique des changements de sous-ensembles des terminaux
-- ============================================================
-- Toute modification d'une colonne `*_reference` (sous-ensemble) sur
-- `terminaux` (parc en agence) ou `terminaux_assembles` (stock) est
-- journalisée par trigger, quelle que soit l'origine :
--   * remplacement lors d'une intervention de maintenance,
--   * modification manuelle de la configuration,
--   * ré-import du stock / libération.
--
-- L'historique est indexé par RÉFÉRENCE de terminal (ID_TRM), sans clé
-- étrangère : il survit à la suppression / libération du terminal.
--
-- Idempotent : peut être rejoué sans effet de bord.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.terminal_sous_ensembles_historique (
  id                 BIGSERIAL PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  terminal_reference text NOT NULL,          -- ID_TRM
  terminal_id        text,                   -- id `terminaux` au moment du changement (si parc)
  origine            text NOT NULL,          -- 'parc' | 'stock'
  sous_ensemble      text,                   -- colonne concernée (ex. ecran_reference)
  ancienne_reference text,
  nouvelle_reference text,
  type_changement    text NOT NULL,          -- 'maintenance' | 'configuration' | 'stock'
  intervention_id    text,                   -- intervention de maintenance liée
  agence_id          text,
  commentaire        text
);

CREATE INDEX IF NOT EXISTS terminal_se_hist_reference_idx
  ON public.terminal_sous_ensembles_historique (terminal_reference, created_at DESC);
CREATE INDEX IF NOT EXISTS terminal_se_hist_intervention_idx
  ON public.terminal_sous_ensembles_historique (intervention_id);

ALTER TABLE public.terminal_sous_ensembles_historique ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour l'app : l'écriture se fait uniquement par trigger
-- (SECURITY DEFINER). Pas de policy UPDATE/DELETE → journal inviolable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'terminal_sous_ensembles_historique'
      AND policyname = 'Allow app select on terminal_sous_ensembles_historique'
  ) THEN
    CREATE POLICY "Allow app select on terminal_sous_ensembles_historique"
      ON public.terminal_sous_ensembles_historique FOR SELECT
      USING (auth.role() IN ('anon', 'authenticated'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- Trigger de journalisation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_terminal_sous_ensembles_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_row          jsonb := to_jsonb(OLD);
  new_row          jsonb := to_jsonb(NEW);
  is_parc          boolean := TG_TABLE_NAME = 'terminaux';
  col              text;
  old_ref          text;
  new_ref          text;
  v_type           text;
  v_intervention   text;
  v_commentaire    text;
BEGIN
  FOR col IN SELECT jsonb_object_keys(new_row) LOOP
    CONTINUE WHEN right(col, 10) <> '_reference';

    old_ref := NULLIF(btrim(old_row ->> col), '');
    new_ref := NULLIF(btrim(new_row ->> col), '');
    CONTINUE WHEN old_ref IS NOT DISTINCT FROM new_ref;

    v_type := CASE WHEN is_parc THEN 'configuration' ELSE 'stock' END;
    v_intervention := NULL;
    v_commentaire := NULL;

    IF is_parc THEN
      -- Remplacement issu d'une intervention de maintenance (enregistrée juste avant).
      SELECT i.id::text, i.commentaire
        INTO v_intervention, v_commentaire
        FROM public.interventions_maintenance i
       WHERE i.terminal_id::text = new_row ->> 'id'
         AND i.sous_ensemble = old_ref
         AND i.reference_remplacement = new_ref
         AND i.created_at > now() - interval '1 day'
       ORDER BY i.created_at DESC
       LIMIT 1;
      IF v_intervention IS NOT NULL THEN
        v_type := 'maintenance';
      END IF;
    ELSE
      -- Côté stock : ne pas dupliquer un changement déjà journalisé côté parc
      -- (resynchronisation du stock lors d'une libération).
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.terminal_sous_ensembles_historique h
         WHERE h.terminal_reference = NEW.reference
           AND h.sous_ensemble = col
           AND h.ancienne_reference IS NOT DISTINCT FROM old_ref
           AND h.nouvelle_reference IS NOT DISTINCT FROM new_ref
      );
    END IF;

    INSERT INTO public.terminal_sous_ensembles_historique (
      terminal_reference, terminal_id, origine, sous_ensemble,
      ancienne_reference, nouvelle_reference, type_changement,
      intervention_id, agence_id, commentaire
    ) VALUES (
      NEW.reference,
      CASE WHEN is_parc THEN new_row ->> 'id' ELSE NULLIF(new_row ->> 'terminal_id', '') END,
      CASE WHEN is_parc THEN 'parc' ELSE 'stock' END,
      col,
      old_ref,
      new_ref,
      v_type,
      v_intervention,
      NULLIF(new_row ->> 'agence_id', ''),
      v_commentaire
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_terminaux_sous_ensembles_hist ON public.terminaux;
CREATE TRIGGER trg_terminaux_sous_ensembles_hist
  AFTER UPDATE ON public.terminaux
  FOR EACH ROW EXECUTE FUNCTION public.log_terminal_sous_ensembles_changes();

DROP TRIGGER IF EXISTS trg_terminaux_assembles_sous_ensembles_hist ON public.terminaux_assembles;
CREATE TRIGGER trg_terminaux_assembles_sous_ensembles_hist
  AFTER UPDATE ON public.terminaux_assembles
  FOR EACH ROW EXECUTE FUNCTION public.log_terminal_sous_ensembles_changes();

-- ------------------------------------------------------------
-- Reprise : remplacements passés enregistrés en maintenance
-- ------------------------------------------------------------
INSERT INTO public.terminal_sous_ensembles_historique (
  created_at, terminal_reference, terminal_id, origine, sous_ensemble,
  ancienne_reference, nouvelle_reference, type_changement,
  intervention_id, agence_id, commentaire
)
SELECT
  COALESCE(i.date_fin, i.date_intervention, i.created_at),
  t.reference,
  t.id::text,
  'parc',
  col.key,
  i.sous_ensemble,
  i.reference_remplacement,
  'maintenance',
  i.id::text,
  t.agence_id::text,
  i.commentaire
FROM public.interventions_maintenance i
JOIN public.terminaux t ON t.id = i.terminal_id
LEFT JOIN LATERAL (
  SELECT e.key
    FROM jsonb_each_text(to_jsonb(t)) e
   WHERE right(e.key, 10) = '_reference'
     AND e.value = i.reference_remplacement
   LIMIT 1
) col ON true
WHERE i.equipement_remplace IS TRUE
  AND NULLIF(btrim(i.reference_remplacement), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.terminal_sous_ensembles_historique h
     WHERE h.intervention_id = i.id::text
  );

-- ------------------------------------------------------------
-- Protection : ne plus effacer les interventions quand un terminal
-- est supprimé / libéré du parc (ON DELETE CASCADE → SET NULL).
-- ------------------------------------------------------------
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.interventions_maintenance'::regclass
       AND c.confrelid = 'public.terminaux'::regclass
       AND c.contype = 'f'
       AND c.confdeltype = 'c'          -- CASCADE
       AND a.attname = 'terminal_id'
  LOOP
    EXECUTE format('ALTER TABLE public.interventions_maintenance DROP CONSTRAINT %I', fk.conname);
    ALTER TABLE public.interventions_maintenance
      ADD CONSTRAINT interventions_maintenance_terminal_id_fkey
      FOREIGN KEY (terminal_id) REFERENCES public.terminaux(id) ON DELETE SET NULL;
  END LOOP;
END $$;
