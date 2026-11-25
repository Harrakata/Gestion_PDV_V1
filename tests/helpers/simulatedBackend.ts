import type { Page, Route } from '@playwright/test';

// Base simulée : authentification, lectures filtrées et journal des écritures.
// Rien ne sort du navigateur ; les lignes fournies sont les seules données visibles.
export type Row = Record<string, any>;
export type Account = { id: string; email: string; password: string };
export type Write = { method: string; table: string; body: any; query: string };

/** Écritures de suivi faites par l'application elle-même : journaux, connexions, accusés de lecture. */
export const TRACKING_TABLES = new Set(['activites_sessions', 'activites_evenements', 'audit_log', 'sync_health', 'push_subscriptions', 'message_lectures', 'connexions_chefs']);
const isTracking = ({ table, body }: Write) => TRACKING_TABLES.has(table) || JSON.stringify(body) === '{"geo_refusal_ack":true}';

const token = (account: Account) => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: account.id, email: account.email, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 36000 })}.simulation`;
};
const user = (account: Account) => ({ id: account.id, email: account.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });

/** Applique les filtres PostgREST courants ; les autres sont ignorés (lecture plus large). */
const filterRows = (rows: Row[], params: URLSearchParams) => {
  const skip = new Set(['select', 'order', 'limit', 'offset', 'or', 'on_conflict', 'columns']);
  return [...params.entries()].filter(([key]) => !skip.has(key)).reduce((list, [key, raw]) => {
    const column = key.replace(/"/g, '');
    const [, not, operator, value] = /^(not\.)?(eq|neq|ilike|like|is|in|gte|gt|lte|lt)\.([\s\S]*)$/.exec(raw) || [];
    if (!operator) return list;
    const test = (row: Row) => {
      const cell = row[column];
      switch (operator) {
        case 'eq': return String(cell) === value;
        case 'neq': return String(cell) !== value;
        case 'is': return value === 'null' ? cell == null : String(cell) === value;
        case 'in': return value.slice(1, -1).split(',').map(item => item.replace(/^"|"$/g, '')).includes(String(cell));
        case 'ilike': case 'like': return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*|%/g, '.*')}$`, 'i').test(String(cell ?? ''));
        case 'gte': return String(cell) >= value;
        case 'gt': return String(cell) > value;
        case 'lte': return String(cell) <= value;
        default: return String(cell) < value;
      }
    };
    return list.filter(row => (not ? !test(row) : test(row)));
  }, rows);
};

export const simulateBackend = async (page: Page, { accounts = [], tables = {}, realtime = false }: { accounts?: Account[]; tables?: Record<string, Row[]>; realtime?: boolean } = {}) => {
  const writes: Write[] = [];
  const reads: string[] = [];
  const failing = new Set<string>();
  const signIns: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  // Requêtes en cours (données et fichiers des pages chargées à la demande).
  let inFlight = 0;
  let lastActivity = Date.now();
  const started = () => { inFlight += 1; lastActivity = Date.now(); };
  const ended = () => { inFlight = Math.max(0, inFlight - 1); lastActivity = Date.now(); };
  page.on('request', started);
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);

  /** Attend que l'écran soit réellement affiché : plus de requête, puis plus de changement dans la page. */
  const settle = async () => {
    const limit = Date.now() + 15_000;
    while (Date.now() < limit && (inFlight > 0 || Date.now() - lastActivity < 250)) await page.waitForTimeout(50);
    await page.evaluate(() => new Promise<void>(resolve => {
      let quiet = window.setTimeout(finish, 250);
      const observer = new MutationObserver(() => { window.clearTimeout(quiet); quiet = window.setTimeout(finish, 250); });
      const max = window.setTimeout(finish, 4000);
      function finish() { observer.disconnect(); window.clearTimeout(max); resolve(); }
      observer.observe(document.body, { subtree: true, childList: true });
    }));
  };

  const rest = (route: Route, url: URL) => {
    const request = route.request();
    const method = request.method();
    const table = decodeURIComponent(url.pathname.split('/rest/v1/')[1] || '');
    const headers = request.headers();
    const single = (headers.accept || '').includes('vnd.pgrst.object');
    if (method !== 'GET' && method !== 'HEAD') {
      let body: any = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      // Les appels rpc sont des lectures.
      if (table.startsWith('rpc/')) return route.fulfill({ json: single ? null : [] });
      writes.push({ method, table, body, query: url.search });
      return route.fulfill({ status: method === 'POST' ? 201 : 200, json: single ? { id: 1, ...(Array.isArray(body) ? body[0] : body) } : [] });
    }
    reads.push(table);
    if (failing.has(table)) return route.fulfill({ status: 500, json: { message: 'panne simulée' } });
    const rows = filterRows(tables[table] || [], url.searchParams);
    const range = `${rows.length ? `0-${rows.length - 1}` : '*'}/${rows.length}`;
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': range, 'access-control-expose-headers': 'content-range' } });
    if (single) return rows.length === 1 ? route.fulfill({ json: rows[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne ou plusieurs lignes' } });
    const offset = Number(url.searchParams.get('offset')) || 0;
    const limit = Number(url.searchParams.get('limit')) || 1000;
    return route.fulfill({ json: rows.slice(offset, offset + limit), headers: { 'content-range': range, 'access-control-expose-headers': 'content-range' } });
  };

  // Temps réel : coupé par défaut ; sinon, serveur minimal qui accepte les abonnements
  // (comme Supabase : réponse à l'inscription, puis confirmation de l'écoute des tables).
  const subscriptions: { send: (event: string, payload: object) => void; tables: { id: number; table: string }[] }[] = [];
  await page.routeWebSocket(/\/realtime\//, ws => {
    if (!realtime) { ws.close(); return; }
    ws.onMessage(raw => {
      const { topic, event, payload, ref } = JSON.parse(String(raw));
      const send = (name: string, body: object, replyTo: string | null = null) => ws.send(JSON.stringify({ topic, event: name, payload: body, ref: replyTo }));
      if (event === 'phx_join') {
        const changes = (payload.config?.postgres_changes || []).map((change: any, index: number) => ({ ...change, id: subscriptions.length * 100 + index + 1 }));
        subscriptions.push({ send, tables: changes });
        send('phx_reply', { status: 'ok', response: { postgres_changes: changes } }, ref);
        send('system', { status: 'ok', extension: 'postgres_changes', message: 'Subscribed to PostgreSQL', channel: topic });
      } else send('phx_reply', { status: 'ok', response: {} }, ref);
    });
  });
  const emit = (table: string, record: Row = {}, type = 'UPDATE') => subscriptions.forEach(({ send, tables: listened }) => {
    const ids = listened.filter(item => item.table === table).map(item => item.id);
    if (ids.length) send('postgres_changes', { ids, data: { schema: 'public', table, type, commit_timestamp: new Date().toISOString(), errors: null, columns: [], record, old_record: {} } });
  });

  await page.route(/\/(auth|rest|functions|storage)\/v1\//, route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname.includes('/auth/v1/token')) {
      const body = request.postDataJSON() || {};
      const account = accounts.find(item => (body.refresh_token ? body.refresh_token === `refresh-${item.id}` : item.email === body.email && item.password === body.password));
      if (!account) return route.fulfill({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } });
      signIns.push(account.email);
      return route.fulfill({ json: { access_token: token(account), token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: `refresh-${account.id}`, user: user(account) } });
    }
    if (url.pathname.includes('/auth/v1/user')) {
      const bearer = (request.headers().authorization || '').replace('Bearer ', '');
      const account = accounts.find(item => token(item).split('.')[1].slice(0, 20) === (bearer.split('.')[1] || '').slice(0, 20));
      return account ? route.fulfill({ json: user(account) }) : route.fulfill({ status: 401, json: { msg: 'invalid' } });
    }
    if (url.pathname.includes('/auth/v1/')) return route.fulfill({ status: 204 });
    if (url.pathname.includes('/rest/v1/')) return rest(route, url);
    return route.fulfill({ json: {} });
  });

  return {
    signIns,
    errors,
    settle,
    /** Écritures métier : hors suivi d'activité de l'application. */
    writes: () => writes.filter(write => !isTracking(write)),
    allWrites: writes,
    /** Tables lues depuis le début, dans l'ordre (une entrée par requête). */
    reads,
    /** Tables dont la lecture échoue (erreur 500). */
    failing,
    /** Simule un changement en base, diffusé aux écrans abonnés. */
    emit,
    /** Tables écoutées en temps réel. */
    listened: () => subscriptions.flatMap(item => item.tables.map(({ table }) => table)),
  };
};
