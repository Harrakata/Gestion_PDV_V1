-- ============================================================
-- Sécurité — lot A : qui peut modifier les données sensibles
-- À exécuter dans Supabase SQL Editor (ou via migrate.sh)
-- ============================================================
--  Voir docs/SECURITE-LOT-A.md. Retour arrière : scripts/securite/lot-a-retour-arriere.sql.
--
--  Des gardes (déclencheurs) contrôlent chaque INSERT / UPDATE / DELETE venant de
--  l'application sur les profils, les fiches liées à un compte, les paiements de gain, les
--  réglages et les salaires. Les lectures et les règles RLS existantes ne changent pas.
--
--  ⚠ INSTALLÉ EN MODE « observe » : RIEN N'EST BLOQUÉ. Ce qui aurait été refusé est noté :
--        select * from app_security.refus order by dernier desc;
--     Quand cette liste ne contient plus d'action légitime :
--        select app_security.set_mode('enforce');
--     Pour revenir en observation :
--        select app_security.set_mode('observe');
--
--  Ne sont jamais contrôlés : l'éditeur SQL, pg_cron, les Edge Functions (service_role).
--  Migration idempotente ; elle conserve le mode en place.
-- ============================================================

-- ── 0. Vérification de la structure avant tout changement ───────────────────
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(needed.t || '.' || needed.c, ', ' ORDER BY needed.t, needed.c) INTO v_missing
  FROM (VALUES
    ('profils_exploitation', 'auth_user_id'), ('profils_exploitation', 'statut'), ('profils_exploitation', 'permissions'),
    ('chefs_agence', 'auth_user_id'), ('chefs_agence', 'email'), ('chefs_agence', 'matricule'), ('chefs_agence', 'agenceEnCharge'), ('chefs_agence', 'codePDV'), ('chefs_agence', 'is_current'),
    ('guichetieres', 'auth_user_id'), ('guichetieres', 'email'), ('guichetieres', 'codePrepose'), ('guichetieres', 'agenceAssigne'),
    ('techniciens', 'auth_user_id'), ('techniciens', 'email'),
    ('chefs_secteur', 'auth_user_id'), ('chefs_secteur', 'email'), ('chefs_secteur', 'secteurEnCharge'),
    ('validateurs_paiement_gain', 'auth_user_id'), ('validateurs_paiement_gain', 'email'), ('validateurs_paiement_gain', 'fonction'), ('validateurs_paiement_gain', 'statut'), ('validateurs_paiement_gain', 'regionAssignee'),
    ('demandes_paiement_gain', 'statutGlobal'), ('demandes_paiement_gain', 'niveauValidationCourant'), ('demandes_paiement_gain', 'circuitValidation'), ('demandes_paiement_gain', 'montantGain'),
    ('demandes_paiement_gain', 'chefAgenceId'), ('demandes_paiement_gain', 'chefAgenceMatricule'), ('demandes_paiement_gain', 'dateValidationChef'),
    ('demandes_paiement_gain', 'directeurRegionalId'), ('demandes_paiement_gain', 'directeurRegionalRegion'), ('demandes_paiement_gain', 'directeurGeneralId'),
    ('demandes_paiement_gain', 'agencePaiementNom'), ('demandes_paiement_gain', 'agencePaiementCodePDV'),
    ('app_settings', 'key'), ('app_settings', 'value'),
    ('agences', 'nom'), ('agences', 'codePDV'), ('agences', 'region')
  ) AS needed(t, c)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = needed.t AND column_name = needed.c
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Lot A non installé (rien n''a été modifié) : colonnes absentes : %', v_missing;
  END IF;
END
$$;

-- ── 1. Schéma non exposé par l'API ──────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS app_security;
-- Un déclencheur s'exécute avec le rôle qui écrit, quel qu'il soit (outil connecté à la base).
REVOKE ALL ON SCHEMA app_security FROM PUBLIC;
GRANT USAGE ON SCHEMA app_security TO PUBLIC;

CREATE TABLE IF NOT EXISTS app_security.config (
  seul BOOLEAN PRIMARY KEY DEFAULT true CHECK (seul),
  mode TEXT NOT NULL DEFAULT 'observe' CHECK (mode IN ('observe', 'enforce'))
);
INSERT INTO app_security.config (seul) VALUES (true) ON CONFLICT DO NOTHING;

-- Une ligne par type de refus (compteur), pour ne pas faire grossir la base.
CREATE TABLE IF NOT EXISTS app_security.refus (
  table_nom TEXT NOT NULL,
  operation TEXT NOT NULL,
  appelant  TEXT NOT NULL,
  compte    TEXT NOT NULL,
  raison    TEXT NOT NULL,
  colonnes  TEXT NOT NULL DEFAULT '',
  exemple   TEXT,
  nombre    BIGINT NOT NULL DEFAULT 1,
  premier   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dernier   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_nom, operation, appelant, compte, raison, colonnes)
);
REVOKE ALL ON app_security.config, app_security.refus FROM PUBLIC, anon, authenticated;
-- Sans règle RLS : seul le propriétaire (éditeur SQL) et les fonctions ci-dessous y accèdent.
ALTER TABLE app_security.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_security.refus ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_security.set_mode(p_mode TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ UPDATE app_security.config SET mode = p_mode RETURNING mode $$;

-- ── 2. Qui appelle ? ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_security.claims()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

CREATE OR REPLACE FUNCTION app_security.uid()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT coalesce(app_security.claims()->>'sub', nullif(current_setting('request.jwt.claim.sub', true), '')) $$;

CREATE OR REPLACE FUNCTION app_security.email()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT nullif(lower(btrim(coalesce(app_security.claims()->>'email', current_setting('request.jwt.claim.email', true), ''))), '') $$;

-- 'anon', 'authenticated', 'service_role', ou 'direct' (éditeur SQL, pg_cron). Appelée par des
-- fonctions exécutées avec les droits de l'appelant : current_user est son rôle.
CREATE OR REPLACE FUNCTION app_security.caller(p_current_user NAME)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN r.claim IN ('anon', 'authenticated', 'service_role') THEN r.claim
    WHEN p_current_user IN ('anon', 'authenticated', 'service_role') THEN p_current_user::text
    ELSE 'direct'
  END
  FROM (SELECT coalesce(app_security.claims()->>'role', nullif(current_setting('request.jwt.claim.role', true), '')) AS claim) r
$$;

-- Comparaison de noms : accents, casse et espaces ignorés.
CREATE OR REPLACE FUNCTION app_security.norm(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT translate(lower(btrim(coalesce(p, ''))), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy') $$;

-- La fiche est-elle celle du compte connecté ? (compte pas encore lié : même e-mail)
CREATE OR REPLACE FUNCTION app_security.is_me(p_auth_user_id TEXT, p_email TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT app_security.uid() IS NOT NULL AND (
    p_auth_user_id = app_security.uid()
    OR (p_auth_user_id IS NULL AND app_security.email() IS NOT NULL AND lower(btrim(p_email)) = app_security.email())
  )
$$;

-- ── 3. Droits Exploitation (mêmes règles que src/lib/exploitationProfiles.js) ─
CREATE OR REPLACE FUNCTION app_security.exploitation_level(p_permissions JSONB, p_menu TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  WITH groups(paths) AS (VALUES
    (ARRAY['centre-operationnel', 'chiffres-daffaires', 'points-vente-mobi', 'maintenance-terminaux', 'suivi-pointage', 'controle-presence', 'autorisation-paiement-gain', 'etat-planning-general', 'rapports', 'tickets', 'activites-et-audit', 'notifications-exploitation']),
    (ARRAY['guichetieres', 'techniciens', 'chefs-agence', 'chefs-secteur', 'validation-paiement-gain', 'direction-generale', 'absences']),
    (ARRAY['regions', 'secteurs', 'agences', 'terminaux-mobi', 'referentiel-parametres']),
    (ARRAY['profils-exploitation', 'parametres'])
  ), legacy(menu, paths) AS (VALUES
    ('chiffres-daffaires', ARRAY['ccope', 'ccopeglob']),
    ('suivi-pointage', ARRAY['statistiques'])
  ), old_levels AS (
    SELECT p_permissions->>x AS l FROM legacy, unnest(legacy.paths) x WHERE legacy.menu = p_menu AND p_permissions ? x
  ), siblings AS (
    SELECT p_permissions->>x AS l FROM groups, unnest(groups.paths) x
    WHERE p_menu = ANY (groups.paths) AND x <> p_menu AND p_permissions ? x
  )
  SELECT CASE
    WHEN p_permissions IS NULL THEN 'none'
    WHEN p_permissions ? p_menu THEN CASE WHEN p_permissions->>p_menu IN ('read', 'write') THEN p_permissions->>p_menu ELSE 'none' END
    WHEN EXISTS (SELECT 1 FROM old_levels) THEN CASE WHEN EXISTS (SELECT 1 FROM old_levels WHERE l = 'write') THEN 'write' ELSE 'read' END
    WHEN EXISTS (SELECT 1 FROM siblings WHERE l = 'write') THEN 'write'
    WHEN EXISTS (SELECT 1 FROM siblings WHERE l = 'read') THEN 'read'
    ELSE 'none'
  END
$$;

-- Profil Exploitation actif en écriture sur l'un des menus. Mise en service : tant qu'aucun
-- profil n'est lié à un compte, un compte connecté a tous les droits (comme l'application).
CREATE OR REPLACE FUNCTION app_security.can_write(VARIADIC p_menus TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT app_security.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.profils_exploitation p, unnest(p_menus) m
      WHERE p.auth_user_id::text = app_security.uid() AND p.statut = 'Actif'
        AND app_security.exploitation_level(p.permissions::jsonb, m) = 'write'
    )
    OR NOT EXISTS (SELECT 1 FROM public.profils_exploitation WHERE auth_user_id IS NOT NULL)
  )
$$;

-- ── 4. Autres rôles ─────────────────────────────────────────────────────────
-- Profil désactivé dans « Profil et Fonctionnalité ».
CREATE OR REPLACE FUNCTION app_security.space_active(p_space TEXT, p_id TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.app_settings s
    WHERE s.key = 'profils_espaces_utilisateurs' AND s.value::jsonb -> p_space -> p_id ->> 'statut' = 'Inactif'
  )
$$;

-- Chef d'agence connecté : identifiants, matricule, codes et noms de son agence.
CREATE OR REPLACE FUNCTION app_security.my_chef(OUT ids TEXT[], OUT matricules TEXT[], OUT codes TEXT[], OUT agences TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH me AS (
    SELECT c.* FROM public.chefs_agence c
    WHERE coalesce(c.is_current, true) AND app_security.is_me(c.auth_user_id::text, c.email)
      AND app_security.space_active('espace-chef-agence', c.id::text)
  )
  SELECT
    (SELECT array_agg(DISTINCT all_rows.id::text) FROM public.chefs_agence all_rows WHERE all_rows.id IN (SELECT id FROM me) OR btrim(all_rows.matricule::text) IN (SELECT btrim(matricule::text) FROM me WHERE btrim(matricule::text) <> '')),
    (SELECT array_agg(DISTINCT btrim(matricule::text)) FROM me WHERE btrim(matricule::text) <> ''),
    (SELECT array_agg(DISTINCT btrim("codePDV"::text)) FROM me WHERE btrim("codePDV"::text) <> ''),
    (SELECT array_agg(DISTINCT n) FROM (
      SELECT app_security.norm("agenceEnCharge") AS n FROM me
      UNION SELECT app_security.norm(a.nom) FROM public.agences a JOIN me ON btrim(a."codePDV"::text) = btrim(me."codePDV"::text) AND btrim(me."codePDV"::text) <> ''
    ) names WHERE n <> '')
$$;

-- Validateurs (directeurs) actifs du compte connecté.
CREATE OR REPLACE FUNCTION app_security.my_validators()
RETURNS TABLE (id TEXT, fonction TEXT, region TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT v.id::text, v.fonction::text, app_security.norm(v."regionAssignee")
  FROM public.validateurs_paiement_gain v
  WHERE v.statut = 'Actif' AND v.auth_user_id::text = app_security.uid()
$$;

-- Agences (noms) où travaille ou a travaillé une guichetière.
CREATE OR REPLACE FUNCTION app_security.agencies_of_teller(p_code TEXT)
RETURNS TEXT[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_names TEXT[];
BEGIN
  SELECT array_agg(DISTINCT app_security.norm(g."agenceAssigne")) INTO v_names
  FROM public.guichetieres g WHERE btrim(g."codePrepose"::text) = btrim(p_code);
  IF to_regclass('public.guichetiere_agence_history') IS NOT NULL THEN
    SELECT coalesce(v_names, '{}') || coalesce(array_agg(DISTINCT app_security.norm(h.agence_assignee)), '{}') INTO v_names
    FROM public.guichetiere_agence_history h WHERE btrim(h.code_prepose::text) = btrim(p_code);
  END IF;
  RETURN coalesce(v_names, '{}');
END
$$;

-- Le compte est-il directeur régional de l'une de ces agences ?
CREATE OR REPLACE FUNCTION app_security.is_regional_of(p_agencies TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_security.my_validators() v
    JOIN public.agences a ON app_security.norm(a.region) = v.region
    WHERE v.fonction = 'Directeur régional' AND v.region <> '' AND app_security.norm(a.nom) = ANY (p_agencies)
  )
$$;

-- ── 5. Refus ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_security.note(p_table TEXT, p_op TEXT, p_caller TEXT, p_reason TEXT, p_columns TEXT, p_example TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  INSERT INTO app_security.refus AS r (table_nom, operation, appelant, compte, raison, colonnes, exemple)
  VALUES (p_table, p_op, p_caller, coalesce(app_security.uid(), '-'), left(p_reason, 300), left(coalesce(p_columns, ''), 500), left(p_example, 100))
  ON CONFLICT (table_nom, operation, appelant, compte, raison, colonnes)
  DO UPDATE SET nombre = r.nombre + 1, dernier = now(), exemple = excluded.exemple
$$;

CREATE OR REPLACE FUNCTION app_security.enforcing()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT mode = 'enforce' FROM app_security.config $$;

-- Colonnes modifiées (l'horodatage technique ne compte pas).
CREATE OR REPLACE FUNCTION app_security.changed(p_old JSONB, p_new JSONB)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT coalesce(array_agg(n.key ORDER BY n.key), '{}') FROM jsonb_each(p_new) n
  WHERE n.key <> 'updated_at' AND n.value IS DISTINCT FROM p_old->n.key
$$;

-- ── 6. Règles ───────────────────────────────────────────────────────────────
--  Chaque règle renvoie NULL (autorisé) ou la raison du refus. o / n : ligne avant / après.

-- Fiches liées à un compte. p_menus : menus qui gèrent la fiche ; p_rename : menu → colonne
-- mise à jour en cascade lors d'un renommage (agence, secteur).
CREATE OR REPLACE FUNCTION app_security.rule_person(p_op TEXT, o JSONB, n JSONB, c TEXT[], p_menus TEXT[], p_rename JSONB)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF app_security.can_write(VARIADIC p_menus) THEN RETURN NULL; END IF;
  IF p_op <> 'UPDATE' THEN RETURN 'réservé à l''Exploitation'; END IF;
  -- Renommage d'une agence ou d'un secteur.
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_rename) r WHERE c <@ ARRAY[r.value] AND app_security.can_write(r.key)) THEN RETURN NULL; END IF;
  -- Sa propre fiche : coordonnées et photo.
  IF app_security.is_me(o->>'auth_user_id', o->>'email') AND c <@ ARRAY['nom', 'prenom', 'telephone', 'photo_url'] THEN RETURN NULL; END IF;
  -- Première connexion : rattachement de la fiche qui porte l'e-mail du compte.
  IF c = ARRAY['auth_user_id'] AND n->>'auth_user_id' = app_security.uid()
     AND app_security.email() IS NOT NULL AND lower(btrim(o->>'email')) = app_security.email() THEN RETURN NULL; END IF;
  IF 'auth_user_id' = ANY (c) THEN RETURN 'rattachement de compte non autorisé'; END IF;
  RETURN 'fiche d''une autre personne, ou champ réservé à l''Exploitation';
END
$$;

-- Réglages : menus autorisés par clé.
CREATE OR REPLACE FUNCTION app_security.rule_setting(p_op TEXT, o JSONB, n JSONB)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_key TEXT := coalesce(n->>'key', o->>'key');
  v_menus TEXT[];
BEGIN
  IF p_op = 'DELETE' THEN RETURN 'suppression de réglage'; END IF;
  IF p_op = 'UPDATE' AND n->>'key' IS DISTINCT FROM o->>'key' THEN RETURN 'changement de clé de réglage'; END IF;
  IF v_key = 'activity_purge_status' THEN RETURN 'réglage écrit par la base'; END IF;
  v_menus := CASE
    WHEN v_key IN ('functionalites_espaces', 'functionalites_espaces_onglets', 'profils_espaces_utilisateurs', 'profils_espaces_templates', 'client_branding', 'org_structure') THEN ARRAY['profils-exploitation']
    WHEN v_key IN ('notification_settings', 'reminder_config') THEN ARRAY['notifications-exploitation']
    WHEN v_key LIKE 'mobi\_rentabilite:%' THEN ARRAY['points-vente-mobi']
    WHEN v_key = 'custom_salary_formulas' THEN ARRAY['parametres', 'chiffres-daffaires']
    ELSE ARRAY['parametres']
  END;
  IF app_security.can_write(VARIADIC v_menus) THEN RETURN NULL; END IF;
  RETURN 'réglage ' || coalesce(v_key, '?') || ' : écriture requise sur ' || array_to_string(v_menus, ' ou ');
END
$$;

-- Étape où se trouve réellement une demande (cf. getEffectiveWorkflowStage).
CREATE OR REPLACE FUNCTION app_security.gain_stage(d JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN d->>'statutGlobal' IN ('Payée', 'Refusée') THEN 'terminee'
    WHEN coalesce(d->>'circuitValidation', '') LIKE '%Chef d’agence%' AND d->>'dateValidationChef' IS NULL
         AND d->>'statutGlobal' <> 'Autorisée pour paiement' THEN 'chef_agence'
    ELSE d->>'niveauValidationCourant'
  END
$$;

-- Validations exigées pour un montant (cf. resolveProcedureForAmount) ; NULL : aucune procédure.
CREATE OR REPLACE FUNCTION app_security.gain_approvals(p_amount NUMERIC, OUT chef BOOLEAN, OUT regional BOOLEAN, OUT general BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.paiement_gain_workflow_config') IS NULL OR NOT EXISTS (SELECT 1 FROM public.paiement_gain_workflow_config) THEN
    chef := p_amount >= 1000000; regional := p_amount >= 5000000; general := p_amount >= 50000000;
    RETURN;
  END IF;
  SELECT w."requiresChefApproval", w."requiresRegionalApproval", w."requiresGeneralApproval" INTO chef, regional, general
  FROM public.paiement_gain_workflow_config w
  WHERE w.statut = 'Actif' AND p_amount >= coalesce(w."montantMin", 0) AND (w."montantMax" IS NULL OR p_amount < w."montantMax")
  ORDER BY w.ordre, w."montantMin", w.libelle LIMIT 1;
  IF NOT FOUND THEN -- borne supérieure exacte : tranche suivante, sinon celle-ci
    SELECT w."requiresChefApproval", w."requiresRegionalApproval", w."requiresGeneralApproval" INTO chef, regional, general
    FROM public.paiement_gain_workflow_config w
    WHERE w.statut = 'Actif' AND (w."montantMax" = p_amount OR w.ordre > (SELECT min(b.ordre) FROM public.paiement_gain_workflow_config b WHERE b.statut = 'Actif' AND b."montantMax" = p_amount))
      AND EXISTS (SELECT 1 FROM public.paiement_gain_workflow_config b WHERE b.statut = 'Actif' AND b."montantMax" = p_amount)
    ORDER BY (w."montantMax" IS NOT DISTINCT FROM p_amount), w.ordre LIMIT 1;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_security.rule_gain(p_op TEXT, o JSONB, n JSONB, c TEXT[])
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  chef RECORD;
  need RECORD;
  v_stage TEXT;
  v_circuit TEXT;
  v_next TEXT;
  v_rejected BOOLEAN;
  c_decision CONSTANT TEXT[] := ARRAY['statutGlobal', 'niveauValidationCourant', 'commentaireDerniereAction'];
  c_status CONSTANT JSONB := '{"chef_agence": "En attente chef d’agence", "directeur_regional": "En attente directeur régional", "directeur_general": "En attente directeur général", "exploitation": "En attente exploitation"}';
  c_rank CONSTANT JSONB := '{"chef_agence": 0, "directeur_regional": 1, "directeur_general": 2, "exploitation": 3}';
BEGIN
  IF p_op = 'DELETE' THEN RETURN 'suppression de demande de paiement'; END IF;
  SELECT * INTO chef FROM app_security.my_chef();

  -- ── Création : chef d'agence, pour lui-même, sans sauter d'étape ──
  IF p_op = 'INSERT' THEN
    IF chef.ids IS NULL THEN RETURN 'création réservée à un chef d''agence'; END IF;
    IF NOT (coalesce(n->>'chefAgenceId' = ANY (chef.ids), false) OR coalesce(btrim(n->>'chefAgenceMatricule') = ANY (chef.matricules), false)) THEN
      RETURN 'création au nom d''un autre chef d''agence';
    END IF;
    IF n->>'dateValidationChef' IS NOT NULL OR n->>'dateValidationDirecteurRegional' IS NOT NULL OR n->>'dateValidationDirecteurGeneral' IS NOT NULL
       OR n->>'dateAutorisationExploitation' IS NOT NULL OR n->>'datePaiementFinal' IS NOT NULL
       OR n->>'agencePaiementNom' IS NOT NULL OR n->>'agencePaiementCodePDV' IS NOT NULL THEN
      RETURN 'demande créée déjà validée';
    END IF;
    IF n->>'statutGlobal' IS DISTINCT FROM c_status->>(n->>'niveauValidationCourant') THEN
      RETURN 'étape de départ incohérente';
    END IF;
    SELECT * INTO need FROM app_security.gain_approvals((n->>'montantGain')::numeric);
    IF need.chef IS NULL THEN RETURN 'aucune procédure pour ce montant'; END IF;
    v_circuit := coalesce(n->>'circuitValidation', '');
    IF (need.chef AND v_circuit NOT LIKE '%Chef d’agence%') OR (need.regional AND v_circuit NOT LIKE '%Directeur régional%')
       OR (need.general AND v_circuit NOT LIKE '%Directeur général%') THEN
      RETURN 'circuit de validation incomplet pour ce montant';
    END IF;
    v_next := CASE WHEN need.regional THEN 'directeur_regional' WHEN need.general THEN 'directeur_general' ELSE 'exploitation' END;
    IF (c_rank->>(n->>'niveauValidationCourant'))::int > (c_rank->>v_next)::int THEN RETURN 'étape de validation sautée'; END IF;
    RETURN NULL;
  END IF;

  -- ── Photo de la pièce, envoyée après coup par le chef qui a créé la demande ──
  v_rejected := n->>'statutGlobal' = 'Refusée' AND n->>'niveauValidationCourant' = 'terminee';
  IF chef.ids IS NOT NULL AND (coalesce(o->>'chefAgenceId' = ANY (chef.ids), false) OR coalesce(btrim(o->>'chefAgenceMatricule') = ANY (chef.matricules), false)) THEN
    IF c <@ ARRAY['photoPieceUrl'] AND o->>'photoPieceUrl' IS NULL THEN RETURN NULL; END IF;
  END IF;

  v_stage := app_security.gain_stage(o);
  v_circuit := coalesce(o->>'circuitValidation', '');

  -- ── Chef d'agence : sa validation ──
  IF v_stage = 'chef_agence' THEN
    IF chef.ids IS NULL OR NOT (coalesce(o->>'chefAgenceId' = ANY (chef.ids), false) OR coalesce(btrim(o->>'chefAgenceMatricule') = ANY (chef.matricules), false)) THEN
      RETURN 'étape chef d''agence : réservée au chef qui a créé la demande';
    END IF;
    v_next := CASE WHEN v_circuit LIKE '%Directeur régional%' THEN 'directeur_regional' WHEN v_circuit LIKE '%Directeur général%' THEN 'directeur_general' ELSE 'exploitation' END;
    IF v_rejected AND c <@ c_decision THEN RETURN NULL; END IF;
    IF c <@ (c_decision || ARRAY['dateValidationChef']) AND n->>'dateValidationChef' IS NOT NULL
       AND n->>'niveauValidationCourant' = v_next AND n->>'statutGlobal' = c_status->>v_next THEN RETURN NULL; END IF;
    RETURN 'décision du chef d''agence non conforme au circuit';
  END IF;

  -- ── Directeur régional ──
  IF v_stage = 'directeur_regional' THEN
    IF NOT EXISTS (
      SELECT 1 FROM app_security.my_validators() v WHERE v.fonction = 'Directeur régional'
        AND (v.id = o->>'directeurRegionalId' OR (v.region <> '' AND v.region = app_security.norm(o->>'directeurRegionalRegion')))
    ) THEN RETURN 'étape directeur régional : réservée au directeur concerné'; END IF;
    v_next := CASE WHEN (o->>'montantGain')::numeric >= 50000000 OR v_circuit LIKE '%Directeur général%' THEN 'directeur_general' ELSE 'exploitation' END;
    IF v_rejected AND c <@ c_decision THEN RETURN NULL; END IF;
    IF c <@ (c_decision || ARRAY['dateValidationDirecteurRegional']) AND n->>'dateValidationDirecteurRegional' IS NOT NULL
       AND n->>'niveauValidationCourant' = v_next AND n->>'statutGlobal' = c_status->>v_next THEN RETURN NULL; END IF;
    RETURN 'décision du directeur régional non conforme au circuit';
  END IF;

  -- ── Directeur général ──
  IF v_stage = 'directeur_general' THEN
    IF NOT EXISTS (SELECT 1 FROM app_security.my_validators() v WHERE v.fonction = 'Directeur général' AND v.id = o->>'directeurGeneralId') THEN
      RETURN 'étape directeur général : réservée au directeur désigné';
    END IF;
    IF v_rejected AND c <@ c_decision THEN RETURN NULL; END IF;
    IF c <@ (c_decision || ARRAY['dateValidationDirecteurGeneral']) AND n->>'dateValidationDirecteurGeneral' IS NOT NULL
       AND n->>'niveauValidationCourant' = 'exploitation' AND n->>'statutGlobal' = c_status->>'exploitation' THEN RETURN NULL; END IF;
    RETURN 'décision du directeur général non conforme au circuit';
  END IF;

  -- ── Exploitation : autorisation de paiement ──
  IF v_stage = 'exploitation' THEN
    IF NOT app_security.can_write('autorisation-paiement-gain') THEN RETURN 'étape Exploitation : écriture requise sur Autorisation Paiement Gain'; END IF;
    IF c <@ (c_decision || ARRAY['agencePaiementNom', 'agencePaiementCodePDV', 'dateAutorisationExploitation'])
       AND n->>'statutGlobal' = 'Autorisée pour paiement' AND n->>'niveauValidationCourant' = 'agence_paiement'
       AND btrim(coalesce(n->>'agencePaiementNom', '')) <> '' AND n->>'dateAutorisationExploitation' IS NOT NULL THEN RETURN NULL; END IF;
    RETURN 'autorisation Exploitation non conforme';
  END IF;

  -- ── Paiement par l'agence désignée ──
  IF v_stage = 'agence_paiement' AND o->>'statutGlobal' = 'Autorisée pour paiement' THEN
    IF chef.ids IS NULL OR NOT (CASE
      WHEN btrim(coalesce(o->>'agencePaiementCodePDV', '')) <> '' AND chef.codes IS NOT NULL THEN btrim(o->>'agencePaiementCodePDV') = ANY (chef.codes)
      ELSE coalesce(app_security.norm(o->>'agencePaiementNom') = ANY (chef.agences), false)
    END) THEN RETURN 'paiement réservé au chef de l''agence désignée'; END IF;
    IF c <@ (c_decision || ARRAY['datePaiementFinal']) AND n->>'statutGlobal' = 'Payée' AND n->>'niveauValidationCourant' = 'terminee'
       AND n->>'datePaiementFinal' IS NOT NULL THEN RETURN NULL; END IF;
    RETURN 'confirmation de paiement non conforme';
  END IF;

  RETURN 'demande terminée ou étape inconnue';
END
$$;

-- Objectifs : Exploitation, chef pour son agence, directeur régional pour sa région.
CREATE OR REPLACE FUNCTION app_security.rule_objective(o JSONB, n JSONB)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  chef RECORD;
  d JSONB;
BEGIN
  IF app_security.can_write('chiffres-daffaires') THEN RETURN NULL; END IF;
  SELECT * INTO chef FROM app_security.my_chef();
  FOREACH d IN ARRAY array_remove(ARRAY[o, n], NULL) LOOP
    IF d->>'level' = 'agence' AND chef.agences IS NOT NULL AND app_security.norm(d->>'target_key') = ANY (chef.agences) THEN CONTINUE; END IF;
    IF d->>'level' = 'region' AND EXISTS (
      SELECT 1 FROM app_security.my_validators() v WHERE v.fonction = 'Directeur régional' AND v.region <> '' AND v.region = app_security.norm(d->>'target_key')
    ) THEN CONTINUE; END IF;
    RETURN 'objectif hors de son périmètre';
  END LOOP;
  RETURN NULL;
END
$$;

-- Versements : Exploitation, chef et directeur régional des guichetières concernées.
CREATE OR REPLACE FUNCTION app_security.rule_payment(o JSONB, n JSONB)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  chef RECORD;
  d JSONB;
  v_agencies TEXT[];
BEGIN
  IF app_security.can_write('chiffres-daffaires') THEN RETURN NULL; END IF;
  SELECT * INTO chef FROM app_security.my_chef();
  FOREACH d IN ARRAY array_remove(ARRAY[o, n], NULL) LOOP
    v_agencies := app_security.agencies_of_teller(d->>'guichetiere_code');
    IF (chef.agences IS NOT NULL AND v_agencies && chef.agences) OR app_security.is_regional_of(v_agencies) THEN CONTINUE; END IF;
    RETURN 'versement d''une guichetière hors de son périmètre';
  END LOOP;
  RETURN NULL;
END
$$;

-- Historique des affectations : Exploitation (guichetières), ou renommage d'agence.
CREATE OR REPLACE FUNCTION app_security.rule_assignment(p_op TEXT, c TEXT[])
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE
    WHEN app_security.can_write('guichetieres') THEN NULL
    WHEN p_op = 'UPDATE' AND c <@ ARRAY['agence_assignee'] AND app_security.can_write('agences') THEN NULL
    ELSE 'affectation réservée à l''Exploitation'
  END
$$;

-- Journal du circuit : ajout seulement, par une personne du circuit.
CREATE OR REPLACE FUNCTION app_security.rule_gain_event(p_op TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_op <> 'INSERT' THEN RETURN 'journal de paiement non modifiable'; END IF;
  IF (SELECT ids FROM app_security.my_chef()) IS NOT NULL OR EXISTS (SELECT 1 FROM app_security.my_validators())
     OR app_security.can_write('autorisation-paiement-gain') THEN RETURN NULL; END IF;
  RETURN 'journal de paiement : personne hors du circuit';
END
$$;

-- ── 7. Garde commune ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_security.guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' -- droits de l'appelant : current_user = son rôle
AS $$
DECLARE
  v_caller TEXT := app_security.caller(current_user);
  o JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  c TEXT[] := CASE WHEN TG_OP = 'UPDATE' THEN app_security.changed(to_jsonb(OLD), to_jsonb(NEW)) ELSE '{}' END;
  v_reason TEXT;
BEGIN
  IF v_caller IN ('service_role', 'direct') OR (TG_OP = 'UPDATE' AND c = '{}') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF v_caller = 'anon' OR app_security.uid() IS NULL THEN
      v_reason := 'sans connexion';
    ELSE
      v_reason := CASE TG_TABLE_NAME
        WHEN 'profils_exploitation' THEN app_security.rule_person(TG_OP, o, n, c, ARRAY['profils-exploitation'], '{}')
        WHEN 'profil_utilisateur_templates' THEN CASE WHEN NOT app_security.can_write('profils-exploitation') THEN 'écriture requise sur profils-exploitation' END
        WHEN 'chefs_agence' THEN app_security.rule_person(TG_OP, o, n, c, ARRAY['chefs-agence'], '{"agences": "agenceEnCharge"}')
        WHEN 'guichetieres' THEN app_security.rule_person(TG_OP, o, n, c, ARRAY['guichetieres'], '{"agences": "agenceAssigne"}')
        WHEN 'chefs_secteur' THEN app_security.rule_person(TG_OP, o, n, c, ARRAY['chefs-secteur'], '{"secteurs": "secteurEnCharge"}')
        WHEN 'techniciens' THEN app_security.rule_person(TG_OP, o, n, c, ARRAY['techniciens'], '{}')
        WHEN 'validateurs_paiement_gain' THEN app_security.rule_person(TG_OP, o, n, c,
          CASE WHEN coalesce(n, o)->>'fonction' = 'Directeur général' OR o->>'fonction' = 'Directeur général' THEN ARRAY['direction-generale'] ELSE ARRAY['validation-paiement-gain'] END, '{}')
        WHEN 'paiement_gain_workflow_config' THEN CASE WHEN NOT app_security.can_write('autorisation-paiement-gain') THEN 'écriture requise sur autorisation-paiement-gain' END
        WHEN 'paiement_gain_workflow_events' THEN app_security.rule_gain_event(TG_OP)
        WHEN 'demandes_paiement_gain' THEN app_security.rule_gain(TG_OP, o, n, c)
        WHEN 'app_settings' THEN app_security.rule_setting(TG_OP, o, n)
        WHEN 'salaire_config_historique' THEN CASE WHEN NOT app_security.can_write('parametres') THEN 'écriture requise sur parametres' END
        WHEN 'objectifs_salaire' THEN app_security.rule_objective(o, n)
        WHEN 'versements_guichetieres' THEN app_security.rule_payment(o, n)
        WHEN 'guichetiere_agence_history' THEN app_security.rule_assignment(TG_OP, c)
        ELSE 'table non prévue'
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_reason := 'erreur interne de la garde : ' || SQLERRM; -- en observation, l'action passe
  END;

  IF v_reason IS NOT NULL THEN
    IF app_security.enforcing() THEN
      RAISE EXCEPTION 'Action non autorisée : %', v_reason USING ERRCODE = '42501';
    END IF;
    PERFORM app_security.note(TG_TABLE_NAME, TG_OP, v_caller, v_reason, array_to_string(c, ', '),
      coalesce(coalesce(n, o)->>'id', coalesce(n, o)->>'key'));
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

-- Droits : les fonctions s'exécutent, la configuration et les refus ne se lisent ni ne se changent.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_security TO PUBLIC;
REVOKE ALL ON FUNCTION app_security.set_mode(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ── 8. Installation sur les tables présentes ────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profils_exploitation', 'profil_utilisateur_templates', 'chefs_agence', 'guichetieres', 'chefs_secteur', 'techniciens',
    'validateurs_paiement_gain', 'paiement_gain_workflow_config', 'paiement_gain_workflow_events', 'demandes_paiement_gain',
    'app_settings', 'salaire_config_historique', 'objectifs_salaire', 'versements_guichetieres', 'guichetiere_agence_history'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table % absente : ignorée.', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS aa_app_security ON public.%I', t);
    EXECUTE format('CREATE TRIGGER aa_app_security BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_security.guard()', t);
  END LOOP;
END
$$;

SELECT 'Lot A installé, mode ' || mode AS resultat FROM app_security.config;
