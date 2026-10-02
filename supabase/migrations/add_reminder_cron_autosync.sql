-- ============================================================
-- Auto-synchronisation des rappels pg_cron (GÉNÉRIQUE, identique pour tous les clients)
-- ============================================================
--  Aucune valeur propre au client dans ce script.
--  • L'endpoint (URL de la fonction) + la clé publique (anon) sont fournis par le FRONT
--    via le RPC set_reminder_endpoint(), à partir de ses variables d'env par-client
--    (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) → zéro paramétrage manuel.
--  • Un TRIGGER reprogramme les jobs pg_cron aux heures EXACTES des créneaux dès que
--    les réglages changent (Paramètres → 'general', ou 'reminder_config').
--
--  Prérequis : extensions pg_cron + pg_net activées.
-- ============================================================

-- 1) Stockage privé (schéma non exposé par l'API → invisible des clients).
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.reminder_secrets (name text primary key, value text);
revoke all on private.reminder_secrets from anon, authenticated;

-- 2) (Re)planification des jobs 'reminders-*' à partir des réglages.
create or replace function public.sync_reminder_cron()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  gen    jsonb;
  cfg    jsonb;
  tzoff  int;
  lead   int;
  matin  text;
  aprem  text;
  rappel boolean;
  cr     jsonb;
  hhmm   text;
  mins   int;
  times  text[] := array[]::text[];
  t      text;
  i      int := 0;
  cmd    text;
begin
  select value into gen from public.app_settings where key = 'general' limit 1;
  select value into cfg from public.app_settings where key = 'reminder_config' limit 1;

  tzoff  := coalesce(nullif(cfg->>'tzOffsetHours','')::int, 0);
  lead   := coalesce(nullif(cfg->>'planningLeadMin','')::int, 15);
  matin  := coalesce(cfg->>'matinStart', '08:00');
  aprem  := coalesce(cfg->>'apresMidiStart', '14:00');
  rappel := coalesce(nullif(gen->>'rappelActif','')::boolean, true);

  -- Créneaux de POINTAGE (si rappelActif) → début converti en UTC.
  if rappel and gen ? 'creneauxPointage' then
    for cr in select jsonb_array_elements(gen->'creneauxPointage') loop
      hhmm := cr->>'debut';
      if hhmm ~ '^[0-9]{1,2}:[0-9]{2}$' then
        mins := (split_part(hhmm,':',1)::int*60 + split_part(hhmm,':',2)::int) - tzoff*60;
        mins := ((mins % 1440) + 1440) % 1440;
        times := array_append(times, (mins % 60)::text || ' ' || (mins / 60)::text);
      end if;
    end loop;
  end if;

  -- Créneaux MAINTENANCE : (matin - lead) et (après-midi - lead), en UTC.
  foreach hhmm in array array[matin, aprem] loop
    if hhmm ~ '^[0-9]{1,2}:[0-9]{2}$' then
      mins := (split_part(hhmm,':',1)::int*60 + split_part(hhmm,':',2)::int) - lead - tzoff*60;
      mins := ((mins % 1440) + 1440) % 1440;
      times := array_append(times, (mins % 60)::text || ' ' || (mins / 60)::text);
    end if;
  end loop;

  -- Nettoyage des anciens jobs de rappel.
  perform cron.unschedule(jobname) from cron.job where jobname like 'reminders-%';

  -- Commande cron : lit endpoint + clé au moment de l'exécution (rien en dur).
  cmd := $cmd$
    select net.http_post(
      url := (select value from private.reminder_secrets where name = 'fn_url'),
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || coalesce((select value from private.reminder_secrets where name = 'api_key'), '')
      ),
      body := '{}'::jsonb
    );
  $cmd$;

  for t in select distinct unnest(times) loop
    i := i + 1;
    perform cron.schedule('reminders-' || i, t || ' * * *', cmd);
  end loop;
end
$fn$;

-- 3) RPC appelé par le FRONT : enregistre l'endpoint + la clé anon (valeurs par-client
--    issues des env du déploiement). Validé pour n'accepter qu'une URL de fonction Supabase.
create or replace function public.set_reminder_endpoint(fn_url text, api_key text)
returns void
language plpgsql
security definer
set search_path = public
as $ep$
begin
  if fn_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/send-reminders$' then
    return; -- ignore toute URL non conforme
  end if;
  insert into private.reminder_secrets(name, value)
  values ('fn_url', fn_url), ('api_key', coalesce(api_key, ''))
  on conflict (name) do update set value = excluded.value;
end
$ep$;
grant execute on function public.set_reminder_endpoint(text, text) to anon, authenticated;

-- 4) Déclencheur : resync quand les créneaux / la config changent.
create or replace function public.trg_sync_reminder_cron()
returns trigger language plpgsql security definer set search_path = public as $trg$
begin
  if new.key in ('general','reminder_config') then
    perform public.sync_reminder_cron();
  end if;
  return new;
end
$trg$;

drop trigger if exists sync_reminder_cron_trg on public.app_settings;
create trigger sync_reminder_cron_trg
  after insert or update on public.app_settings
  for each row execute function public.trg_sync_reminder_cron();

-- 5) Planification initiale (les jobs liront l'endpoint dès que le front l'aura fourni).
select public.sync_reminder_cron();
