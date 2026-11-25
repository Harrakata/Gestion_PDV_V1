-- ============================================================
-- Purge des journaux d'activité (connexions et navigations)
-- À exécuter dans Supabase SQL Editor (ou via migrate.sh)
-- ============================================================
--  Cette migration ne supprime rien. Elle installe une purge qui reste inactive tant
--  qu'une durée n'est pas choisie dans l'application (Paramètres → Mode de ressources →
--  Journaux d'activité), enregistrée dans app_settings/activity_retention : { "days": 30 }.
--
--  Tables concernées : activites_evenements et activites_sessions, et elles seules. Le
--  journal d'audit (audit_log) et les connexions des chefs d'agence (connexions_chefs) ne
--  sont pas touchés.
--
--  Garde-fous :
--   • jamais moins de 30 jours conservés, quelle que soit la valeur enregistrée ;
--   • au plus 50 000 lignes par table et par nuit (une grosse reprise s'étale) ;
--   • fonction inaccessible depuis l'application (exécutée par pg_cron ou l'éditeur SQL).
--
--  Migration idempotente.
-- ============================================================

-- 1) Durée choisie, en jours, ou NULL (= tout conserver). Valeur illisible = tout conserver ;
--    réglage en double (app_settings n'a pas de clé unique) = la durée la plus longue.
CREATE OR REPLACE FUNCTION public.activity_retention_days()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN count(*) > 0 AND bool_and(coalesce(value->>'days', '') ~ '^[0-9]{1,5}$')
      THEN greatest(max(CASE WHEN value->>'days' ~ '^[0-9]{1,5}$' THEN (value->>'days')::INTEGER END), 30)
  END
  FROM public.app_settings
  WHERE key = 'activity_retention';
$$;

-- 2) Compte rendu lu par l'écran Paramètres : app_settings/activity_purge_status.
CREATE OR REPLACE FUNCTION public.set_activity_purge_status(p_patch JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_settings
  SET value = coalesce(value, '{}'::jsonb) || p_patch
  WHERE key = 'activity_purge_status';
  IF NOT FOUND THEN
    INSERT INTO public.app_settings (key, value) VALUES ('activity_purge_status', p_patch);
  END IF;
END
$$;

-- 3) Purge. Renvoie ce qui a été supprimé.
CREATE OR REPLACE FUNCTION public.purge_activity_logs(p_batch INTEGER DEFAULT 50000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days     INTEGER := public.activity_retention_days();
  v_cutoff   TIMESTAMPTZ;
  v_events   INTEGER := 0;
  v_sessions INTEGER := 0;
  v_result   JSONB;
BEGIN
  IF v_days IS NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;
  v_cutoff := now() - make_interval(days => v_days);

  DELETE FROM public.activites_evenements
  WHERE id IN (
    SELECT id FROM public.activites_evenements
    WHERE created_at < v_cutoff
    ORDER BY created_at
    LIMIT p_batch
  );
  GET DIAGNOSTICS v_events = ROW_COUNT;

  -- Seulement les sessions sans évènement restant : la suppression en cascade ne peut rien
  -- emporter de plus récent, ni dépasser la taille du lot.
  DELETE FROM public.activites_sessions
  WHERE id IN (
    SELECT s.id FROM public.activites_sessions s
    WHERE s.last_seen_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM public.activites_evenements e WHERE e.session_id = s.id)
    ORDER BY s.last_seen_at
    LIMIT p_batch
  );
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  v_result := jsonb_build_object('days', v_days, 'sessions', v_sessions, 'events', v_events, 'at', now());
  PERFORM public.set_activity_purge_status(v_result);
  RETURN v_result || jsonb_build_object('active', true);
END
$$;

REVOKE ALL ON FUNCTION public.activity_retention_days() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_activity_purge_status(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_activity_logs(INTEGER) FROM PUBLIC, anon, authenticated;

-- 4) Chaque nuit à 03 h 20 (UTC), si pg_cron est activé.
DO $$
DECLARE
  v_scheduled BOOLEAN := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');
BEGIN
  IF v_scheduled THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'purge-activity-logs';
    PERFORM cron.schedule('purge-activity-logs', '20 3 * * *', 'select public.purge_activity_logs()');
  ELSE
    RAISE NOTICE 'pg_cron absent : activer l''extension puis relancer cette migration.';
  END IF;
  PERFORM public.set_activity_purge_status(jsonb_build_object('scheduled', v_scheduled));
END
$$;
