// Edge Function : gestion des comptes auth.users depuis l'espace Exploitation.
//
// Sécurité (règles et tests : ../_shared/accountManager.js) :
//   1. L'appelant est connecté et son profil Exploitation est actif.
//   2. Il a le droit d'ÉCRITURE sur le menu de chaque fiche à laquelle le compte donne accès :
//      une lecture seule ne suffit pas, et un compte d'administration n'est modifiable que
//      depuis « Profil et Fonctionnalité ».
//   3. Le mot de passe d'un compte déjà rattaché à une fiche n'est jamais changé par « create ».
//   4. La service_role reste côté serveur.
//
// Actions (POST JSON ; `table` : fiche concernée, ex. "guichetieres") :
//   - create        : { table, email, password }  → { user, created } ou { user, reused, passwordKept? }
//   - updatePassword: { table, userId, password }
//   - updateEmail   : { table, userId, email }
//   - delete        : { table, userId }           → { ok, kept? } (kept : compte utilisé ailleurs)
//
// Variables d'environnement (déjà fournies par Supabase) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Déploiement : publier l'application AVANT (elle envoie `table`), puis :
//   supabase functions deploy admin-manage-user

import { createClient } from "npm:@supabase/supabase-js@2";
import { manageAccount } from "../_shared/accountManager.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return jsonResponse({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return jsonResponse({ error: "Edge Function mal configurée : variables Supabase manquantes." }, 500);
  }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "Session invalide" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return jsonResponse({ error: "Session invalide" }, 401);

  const { status, body } = await manageAccount({
    admin,
    caller: data.user,
    body: await req.json().catch(() => null),
    log: (cause: unknown) => console.error("admin-manage-user:", cause instanceof Error ? cause.message : cause),
  });
  return jsonResponse(body, status);
});
