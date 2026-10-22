-- L'accès anon à la table évalue la politique RLS sur tout l'historique avant
-- le DISTINCT ON et dépasse le statement_timeout. La fonction ne contient
-- aucun SQL dynamique et n'expose que les lignes déjà lisibles du suivi.

ALTER FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  SECURITY DEFINER;

ALTER FUNCTION public.get_latest_suivi_trm_mobi_v2(TEXT[])
  SET search_path = public;

NOTIFY pgrst, 'reload schema';
