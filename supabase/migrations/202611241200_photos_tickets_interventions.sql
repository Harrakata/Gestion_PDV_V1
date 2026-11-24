-- ============================================================
-- Photos jointes aux tickets et aux interventions de maintenance
-- À exécuter dans Supabase SQL Editor (ou via migrate.sh)
-- ============================================================
--  Liste d'URL publiques (fichiers dans le bucket de stockage du client, dossiers
--  photos_tickets/ et photos_maintenance/). NULL = aucune photo.
--  Migration idempotente et additive : aucune donnée existante n'est modifiée.
-- ============================================================

ALTER TABLE public.tickets_incidents
  ADD COLUMN IF NOT EXISTS photos JSONB;

ALTER TABLE public.interventions_maintenance
  ADD COLUMN IF NOT EXISTS photos JSONB;

ALTER TABLE public.tickets_incidents DROP CONSTRAINT IF EXISTS tickets_incidents_photos_check;
ALTER TABLE public.tickets_incidents
  ADD CONSTRAINT tickets_incidents_photos_check
  CHECK (photos IS NULL OR jsonb_typeof(photos) = 'array');

ALTER TABLE public.interventions_maintenance DROP CONSTRAINT IF EXISTS interventions_maintenance_photos_check;
ALTER TABLE public.interventions_maintenance
  ADD CONSTRAINT interventions_maintenance_photos_check
  CHECK (photos IS NULL OR jsonb_typeof(photos) = 'array');

-- L'API prend en compte les nouvelles colonnes immédiatement.
NOTIFY pgrst, 'reload schema';
