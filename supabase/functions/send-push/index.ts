// Edge Function : envoi de notifications push (Web Push) ciblées.
//
// Rôle :
//   Choisit les abonnements concernés (push_subscriptions) et envoie à chacun une
//   notification push via le protocole Web Push (clés VAPID). Supprime les
//   abonnements expirés (404/410).
//
// Corps attendu (POST JSON), au choix :
//   { "message_id": number, "roles"?: string[] }
//       Message de l'exploitation : texte et destinataires lus en base, selon la même
//       règle que la cloche (src/features/notifications/messageAudience.js).
//   { "target": { "role"?, "agence_nom"?, "region"?, "user_id"? },   (valeur ou liste)
//     "payload": { "title": string, "body"?: string, "url"?: string, "tag"?: string } }
//       Au moins un critère : sans critère, l'appel est refusé.
//
// Appelant : un utilisateur connecté, ou une autre fonction (clé service_role). La clé
// publique seule ne suffit pas.
//
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY        (déjà fournies par Supabase)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY            (paire VAPID du déploiement, base64url)
//   VAPID_SUBJECT  → "mailto:contact@exemple.com"  (identité de l'émetteur)
//
// ⚠ La clé VAPID_PUBLIC_KEY DOIT être identique à VITE_VAPID_PUBLIC_KEY (front),
//   sinon le service de push (FCM/Mozilla) rejette l'envoi avec un 403.
//
// Déploiement :
//   supabase functions deploy send-push
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { findByMessage, findByTarget, targetFilters } from "../_shared/pushRecipients.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Normalise le sujet VAPID : doit être une URL mailto: ou https:. Un email nu est
// automatiquement préfixé par mailto: (erreur de configuration très fréquente).
function normalizeSubject(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "mailto:admin@example.com";
  if (s.startsWith("mailto:") || s.startsWith("http://") || s.startsWith("https://")) return s;
  return `mailto:${s}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Secrets VAPID — on retire tout espace / retour-ligne parasite (cause classique de crash
  // quand le secret a été collé/importé depuis un fichier).
  const VAPID_PUBLIC_KEY = (Deno.env.get("VAPID_PUBLIC_KEY") ?? "").trim();
  const VAPID_PRIVATE_KEY = (Deno.env.get("VAPID_PRIVATE_KEY") ?? "").trim();
  const VAPID_SUBJECT = normalizeSubject(Deno.env.get("VAPID_SUBJECT") ?? "");
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "vapid_not_configured", hint: "Définir VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY dans les secrets." }, 500);
  }

  // ⚠ setVapidDetails valide le format des clés et du sujet : on l'encapsule pour
  // renvoyer une erreur claire au lieu de crasher (500 générique).
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    return json({
      error: "vapid_setup_failed",
      detail: String((e as Error)?.message ?? e),
      subject: VAPID_SUBJECT,
      publicKeyLen: VAPID_PUBLIC_KEY.length,
      privateKeyLen: VAPID_PRIVATE_KEY.length,
    }, 500);
  }

  // deno-lint-ignore no-explicit-any
  let request: any;
  try {
    request = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token !== serviceKey) {
    const { data } = await supabase.auth.getUser(token);
    if (!data?.user) return json({ error: "unauthorized" }, 401);
  }

  type Subscription = { id: number; endpoint: string; p256dh: string; auth: string };
  let deliveries: Array<{ subscription: Subscription; payload: Record<string, unknown> }> = [];
  try {
    if (request?.message_id != null) {
      const roles = Array.isArray(request.roles) ? request.roles.map(String) : null;
      deliveries = await findByMessage(supabase, request.message_id, roles);
    } else {
      const { target, payload } = request ?? {};
      if (!payload?.title) return json({ error: "missing_title" }, 400);
      if (!targetFilters(target)) return json({ error: "missing_target" }, 400);
      deliveries = (await findByTarget(supabase, target)).map((subscription: Subscription) => ({ subscription, payload }));
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }

  let sent = 0;
  let failed = 0;
  const deadIds: number[] = [];
  const errors: Array<{ id: number; statusCode: number | null; body: string }> = [];

  await Promise.all(
    deliveries.map(async ({ subscription: s, payload }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          // TTL : le service de push conserve la notif jusqu'à 24 h si l'appareil est
          // hors-ligne (ex. navigateur fermé) → livrée à la reconnexion. urgency high
          // pour réveiller les appareils en veille.
          { TTL: 24 * 60 * 60, urgency: "high" },
        );
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number })?.statusCode ?? null;
        const body = String((e as { body?: string })?.body ?? (e as Error)?.message ?? e).slice(0, 300);
        errors.push({ id: s.id, statusCode: code, body });
        if (code === 404 || code === 410) deadIds.push(s.id);
      }
    }),
  );

  if (deadIds.length) await supabase.from("push_subscriptions").delete().in("id", deadIds);

  // `found` = nombre d'abonnements ciblés ; `errors` = détail des échecs (ex. 403 = clés
  // front/serveur différentes, 401 = VAPID invalide).
  return json({ found: deliveries.length, sent, failed, removed: deadIds.length, errors: errors.slice(0, 5) });
});
