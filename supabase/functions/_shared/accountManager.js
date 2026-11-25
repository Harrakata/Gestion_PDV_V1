// Comptes d'accès (auth.users) gérés depuis l'espace Exploitation.
// Sans dépendance à Deno (testé par tests/unit/accountManager.test.js).
//
// Principe : agir sur un compte exige le droit d'ÉCRITURE sur le menu de chaque fiche à
// laquelle ce compte donne accès (mêmes menus que les règles de la base, cf. lot A).
import { canWriteExploitationPath, normalizeExploitationPermissions } from '../../../src/lib/exploitationProfiles.js';

const CARD_TABLES = {
  profils_exploitation: { menu: () => 'profils-exploitation' },
  chefs_agence: { menu: () => 'chefs-agence', extra: 'is_current' },
  guichetieres: { menu: () => 'guichetieres', extra: 'is_current' },
  chefs_secteur: { menu: () => 'chefs-secteur', extra: 'is_current' },
  techniciens: { menu: () => 'techniciens' },
  validateurs_paiement_gain: {
    menu: (card) => (card.fonction === 'Directeur général' ? 'direction-generale' : 'validation-paiement-gain'),
    extra: 'fonction',
  },
};
const ACCOUNT_MENUS = ['profils-exploitation', 'chefs-agence', 'guichetieres', 'chefs-secteur', 'techniciens', 'validation-paiement-gain', 'direction-generale'];
const TABLE_MENUS = { ...Object.fromEntries(Object.entries(CARD_TABLES).map(([table, { menu }]) => [table, [menu({})]])), validateurs_paiement_gain: ['validation-paiement-gain', 'direction-generale'] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 8;
const PAGE = 1000;
const MISSING_TABLE = new Set(['42P01', 'PGRST205']); // niveau secteur non installé, par exemple

class Refusal extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const refuse = (message, status = 403) => { throw new Refusal(message, status); };
const NOT_ALLOWED = "Vous n'avez pas le droit de gérer ce compte.";
const EMAIL_TAKEN = 'Cet e-mail est déjà utilisé par un autre compte.';

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const asObject = (value) => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };

// ── Droits de l'appelant ────────────────────────────────────────────────────
const readRights = async (admin, callerId) => {
  const { data, error } = await admin.from('profils_exploitation').select('id, permissions').eq('auth_user_id', callerId).eq('statut', 'Actif');
  if (error) throw error;
  if (data.length) {
    const levels = data.map((profile) => normalizeExploitationPermissions(asObject(profile.permissions)));
    return (menu) => levels.some((permissions) => canWriteExploitationPath(permissions, menu));
  }
  // Mise en service : le tout premier compte, créé dans Supabase, tant qu'aucun profil n'existe.
  const first = await admin.from('profils_exploitation').select('id', { count: 'exact', head: true });
  if (first.error) throw first.error;
  if (first.count !== 0) refuse('Compte non autorisé à gérer les utilisateurs.');
  return () => true;
};

// ── Fiches auxquelles un compte donne accès ─────────────────────────────────
const readCards = async (admin, refine) => (await Promise.all(Object.entries(CARD_TABLES).map(async ([table, { menu, extra }]) => {
  const { data, error } = await refine(admin.from(table).select(['id', 'auth_user_id', 'email', extra].filter(Boolean).join(', ')));
  if (error) {
    if (MISSING_TABLE.has(error.code)) return [];
    throw error;
  }
  return data.filter((card) => card.is_current !== false).map((card) => ({ table, id: card.id, userId: card.auth_user_id, email: normalizeEmail(card.email), menu: menu(card) }));
}))).flat();

const cardsOfAccount = (admin, userId) => readCards(admin, (query) => query.eq('auth_user_id', userId));
// Une fiche se rattache à la première connexion au compte qui porte son e-mail.
const cardsOfEmail = async (admin, email) => {
  if (!email) return [];
  const pattern = `%${email.replace(/[\\%_]/g, '\\$&')}%`;
  return (await readCards(admin, (query) => query.ilike('email', pattern))).filter((card) => card.email === email);
};
const distinct = (cards) => [...new Map(cards.map((card) => [`${card.table}:${card.id}`, card])).values()];

const requireCards = (canWrite, cards) => {
  if (!cards.every((card) => canWrite(card.menu))) refuse(NOT_ALLOWED);
};

// ── Comptes ─────────────────────────────────────────────────────────────────
const findAccount = async (admin, userId) => {
  if (!UUID.test(String(userId ?? ''))) refuse('Compte introuvable.', 404);
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (data?.user) return data.user;
  if (error && error.status !== 404 && error.code !== 'user_not_found') throw error;
  return null;
};

const findAccountByEmail = async (admin, email) => {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    const found = data.users.find((user) => normalizeEmail(user.email) === email);
    if (found || data.users.length < PAGE) return found || null;
  }
};

const isEmailTaken = (error) => ['email_exists', 'user_already_exists'].includes(error?.code) || /already (been )?(registered|exists)/i.test(error?.message || '');
const isWeakPassword = (error) => error?.code === 'weak_password';
const checkAuth = (error) => {
  if (!error) return;
  if (isEmailTaken(error)) refuse(EMAIL_TAKEN, 409);
  if (isWeakPassword(error)) refuse('Ce mot de passe est trop simple. Choisissez-en un autre.', 400);
  throw error;
};

const readEmail = (value) => {
  const email = normalizeEmail(value);
  if (!EMAIL.test(email)) refuse('Adresse e-mail invalide.', 400);
  return email;
};
const readPassword = (value) => {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD) refuse('Le mot de passe doit contenir au moins 8 caractères.', 400);
  return password;
};
const publicUser = (user) => ({ id: user.id, email: user.email });

// ── Actions ─────────────────────────────────────────────────────────────────
const create = async ({ admin, canWrite, body }) => {
  const { table } = body;
  const email = readEmail(body.email);
  const password = readPassword(body.password);
  requireCards(canWrite, await cardsOfEmail(admin, email));

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error) return { user: publicUser(data.user), created: true };
  if (!isEmailTaken(error)) checkAuth(error);

  const existing = await findAccountByEmail(admin, email);
  if (!existing) refuse(EMAIL_TAKEN, 409);
  const linked = await cardsOfAccount(admin, existing.id);
  if (linked.length) {
    // Une personne, plusieurs rôles : le compte sert aussi à la nouvelle fiche, sans changer son mot de passe.
    if (!table || linked.some((card) => card.table === table) || !linked.every((card) => canWrite(card.menu))) refuse(EMAIL_TAKEN, 409);
    return { user: publicUser(existing), reused: true, passwordKept: true };
  }
  // Compte sans fiche (fiche supprimée, premier compte créé dans Supabase) : repris tel quel.
  checkAuth((await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })).error);
  return { user: publicUser(existing), reused: true };
};

const cardsReachedBy = async (admin, account) => distinct([
  ...await cardsOfAccount(admin, account.id),
  ...await cardsOfEmail(admin, normalizeEmail(account.email)),
]);

const updatePassword = async ({ admin, canWrite, body }) => {
  const password = readPassword(body.password);
  const account = await findAccount(admin, body.userId) || refuse('Compte introuvable.', 404);
  requireCards(canWrite, await cardsReachedBy(admin, account));
  checkAuth((await admin.auth.admin.updateUserById(account.id, { password })).error);
  return { ok: true };
};

const updateEmail = async ({ admin, canWrite, body }) => {
  const email = readEmail(body.email);
  const account = await findAccount(admin, body.userId) || refuse('Compte introuvable.', 404);
  requireCards(canWrite, [...await cardsReachedBy(admin, account), ...await cardsOfEmail(admin, email)]);
  checkAuth((await admin.auth.admin.updateUserById(account.id, { email })).error);
  return { ok: true };
};

const remove = async ({ admin, canWrite, caller, body }) => {
  if (body.userId === caller.id) refuse('Vous ne pouvez pas supprimer votre propre compte.', 400);
  const account = await findAccount(admin, body.userId);
  if (!account) return { ok: true, missing: true }; // déjà supprimé : la fiche peut l'être aussi
  const email = normalizeEmail(account.email);
  const cards = (await cardsReachedBy(admin, account)).filter((card) => card.userId === account.id || (!card.userId && card.email === email));
  const own = cards.filter((card) => card.table === body.table);
  // Le compte sert encore à une autre fiche : il est conservé.
  if (own.length && cards.length > 1) return { ok: true, kept: true };
  requireCards(canWrite, cards);
  if (cards.length > 1) refuse('Ce compte est utilisé par plusieurs fiches.', 409);
  checkAuth((await admin.auth.admin.deleteUser(account.id)).error);
  return { ok: true };
};

const ACTIONS = { create, updatePassword, updateEmail, delete: remove };

/** Traite une demande ; renvoie toujours { status, body }. `admin` : client service_role. */
export const manageAccount = async ({ admin, caller, body, log = () => {} }) => {
  try {
    const action = Object.hasOwn(ACTIONS, body?.action ?? '') ? ACTIONS[body.action] : refuse('Action inconnue.', 400);
    const { table } = body;
    if (table !== undefined && !Object.hasOwn(CARD_TABLES, table)) refuse('Fiche inconnue.', 400);
    const canWrite = await readRights(admin, caller.id);
    if (!(table ? TABLE_MENUS[table] : ACCOUNT_MENUS).some(canWrite)) refuse(NOT_ALLOWED);
    return { status: 200, body: await action({ admin, canWrite, caller, body }) };
  } catch (error) {
    if (error instanceof Refusal) return { status: error.status, body: { error: error.message } };
    log(error);
    return { status: 500, body: { error: 'Gestion du compte impossible pour le moment. Réessayez dans un instant.' } };
  }
};
