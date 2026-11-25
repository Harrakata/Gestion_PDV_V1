-- Retour arrière du lot A (202611261200_securite_lot_a.sql) : retire les gardes.
-- Aucune donnée métier n'est modifiée. À exécuter dans Supabase SQL Editor.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tgrelid::regclass AS nom FROM pg_trigger WHERE tgname = 'aa_app_security' AND NOT tgisinternal LOOP
    EXECUTE format('DROP TRIGGER aa_app_security ON %s', t.nom);
  END LOOP;
END
$$;
DROP SCHEMA IF EXISTS app_security CASCADE;
