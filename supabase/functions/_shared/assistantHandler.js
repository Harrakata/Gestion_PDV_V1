import { ASSISTANT_SPACES, resolveAssistantAccess, validateAssistantMessages } from './assistantAccess.js';
import { guideReply } from './assistantKnowledge.js';
import { lookupAssistantData } from './assistantData.js';
import { runAssistantAgent } from './assistantAgent.js';

const CORS = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SETTING_KEYS = ['functionalites_espaces', 'functionalites_espaces_onglets', 'profils_espaces_utilisateurs', 'org_structure'];

export function createAssistantHandler({ createClient, env, fetchImpl = fetch }) {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Connectez-vous à votre espace.' }, 401);
    const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY'), service = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !service) return json({ error: 'Assistant non configuré.' }, 503);
    if (env('ASSISTANT_ENABLED') === 'false') return json({ error: 'Assistant IA désactivé.' }, 503);
    try {
      const text = await request.text();
      if (text.length > 30000) return json({ error: 'Conversation trop longue.' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'Requête invalide.' }, 400); }
      if (!body || !['capabilities', 'chat'].includes(body.action) || !Object.hasOwn(ASSISTANT_SPACES, body.space)) return json({ error: 'Espace ou action invalide.' }, 400);
      let messages;
      if (body.action === 'chat') {
        try { messages = validateAssistantMessages(body.messages); } catch (error) { return json({ error: error.message }, 400); }
      }
      // The service key reads only authorization metadata. All operational reads use the caller's JWT and RLS.
      const callerClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: { user } = {}, error: authError } = await callerClient.auth.getUser();
      if (authError || !user) return json({ error: 'Session expirée. Reconnectez-vous à votre espace.' }, 401);
      const metadataClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
      const spec = ASSISTANT_SPACES[body.space];
      let profileQuery = metadataClient.from(spec.table).select(spec.columns).eq('auth_user_id', user.id);
      if (spec.active) profileQuery = profileQuery.eq(...spec.active);
      if (spec.fonction) profileQuery = profileQuery.eq('fonction', spec.fonction);
      const [{ data: profile, error: profileError }, { data: settingRows, error: settingsError }] = await Promise.all([
        profileQuery.maybeSingle(), metadataClient.from('app_settings').select('key, value').in('key', SETTING_KEYS),
      ]);
      if (settingsError || profileError) return json({ error: 'Impossible de vérifier vos droits. Réessayez plus tard.' }, 503);
      const settings = Object.fromEntries((settingRows || []).map((row) => [row.key, row.value]));
      // Deployment overrides may only remove rights; they never grant new access.
      const disabledFeatures = String(env('ASSISTANT_DISABLED_FEATURES') || '').split(',').map((key) => key.trim()).filter(Boolean);
      settings.functionalites_espaces = { ...settings.functionalites_espaces };
      disabledFeatures.forEach((key) => { settings.functionalites_espaces[key] = false; });
      if (env('ASSISTANT_SECTEUR_ENABLED') === 'false') settings.org_structure = { ...settings.org_structure, secteur: { enabled: false } };
      let access;
      try { access = resolveAssistantAccess(body.space, profile, settings); } catch (error) { return json({ error: error.message }, 403); }
      const apiKey = env('OPENAI_API_KEY'), model = env('OPENAI_MODEL');
      const ready = Boolean(apiKey && model);
      if (body.action === 'capabilities') return json({ mode: ready ? 'ai' : 'guide', menus: access.menus,
        notice: ready ? null : "L'IA n'est pas configurée. Le guide intégré est disponible ; les états actuels ne sont pas consultés." });
      const currentTab = typeof body.currentTab === 'string' && access.menus.some((menu) => menu.key === body.currentTab) ? body.currentTab : '';
      if (!ready) return json({ ...guideReply(messages.at(-1).content, currentTab, access.menus), notice: "IA non configurée : réponse issue du guide, sans consultation des données actuelles." });
      const { data: quota, error: quotaError } = await callerClient.rpc('consume_assistant_request');
      if (quotaError) return json({ error: 'Le service IA nécessite sa configuration de quota côté serveur.' }, 503);
      if (quota !== true) return json({ error: 'Limite de questions atteinte. Réessayez dans quelques minutes.' }, 429);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const reply = await runAssistantAgent({ messages, access, currentTab, apiKey, model, fetchImpl,
          signal: controller.signal, lookup: (input) => lookupAssistantData(callerClient, access, input) });
        return json(reply);
      } finally { clearTimeout(timer); }
    } catch {
      return json({ error: "Le service IA n'a pas pu répondre. Réessayez ou consultez le guide intégré." }, 502);
    }
  };
}
