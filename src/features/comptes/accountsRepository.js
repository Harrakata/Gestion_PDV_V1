// Comptes d'accès (connexion) des fiches, via la fonction serveur « admin-manage-user », qui
// contrôle les droits. Le client Supabase est fourni par l'appelant.
const MIN_PASSWORD = 8;
const PASSWORD_KEPT = 'Cet e-mail avait déjà un compte : il sert aussi à cette fiche, avec son mot de passe actuel.';

/** Échec à afficher tel quel : titre et message destinés à l'utilisateur. */
export class AccountError extends Error {
  constructor(title, message) { super(message); this.title = title; }
}

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

// Le message de la fonction serveur est dans le corps de la réponse d'erreur.
const readMessage = async (error, data) => {
  if (data?.error) return data.error;
  try { return (await error.context.json()).error || null; } catch { return null; }
};

export const createAccountsRepository = (client, table) => {
  const call = async (title, fallback, body) => {
    // Jeton de la session en cours, renouvelé si besoin.
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new AccountError(title, 'Votre session a expiré. Veuillez vous reconnecter.');
    const { data, error } = await client.functions.invoke('admin-manage-user', {
      body: { ...body, table },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || data?.error) throw new AccountError(title, (await readMessage(error, data)) || fallback);
    return data;
  };

  const checkPassword = (password) => {
    if (password.length < MIN_PASSWORD) throw new AccountError('Mot de passe trop court', 'Au moins 8 caractères requis.');
    return password;
  };

  const create = async (email, password) => {
    const data = await call('Erreur création du compte', "Impossible de créer le compte d'accès.", { action: 'create', email, password: checkPassword(password) });
    if (!data?.user?.id) throw new AccountError('Erreur création du compte', "Impossible de créer le compte d'accès.");
    return { userId: data.user.id, created: !data.reused, notice: data.passwordKept ? PASSWORD_KEPT : '' };
  };

  const setPassword = (userId, password) => call('Erreur réinitialisation', 'Impossible de réinitialiser le mot de passe.', { action: 'updatePassword', userId, password: checkPassword(String(password ?? '').trim()) });
  const setEmail = (userId, email) => call('Erreur mise à jour email', "Impossible de mettre à jour l'email du compte.", { action: 'updateEmail', userId, email });
  const remove = (userId) => call('Suppression refusée', "Impossible de supprimer le compte d'accès.", { action: 'delete', userId });

  return {
    setPassword,
    remove,

    /**
     * Met le compte en accord avec la fiche, juste avant de l'enregistrer.
     * @param current  fiche avant modification ; null à la création.
     * @returns {{ userId, created, notice }} `created` : compte créé à l'instant.
     */
    async sync({ current, email, password }) {
      const address = normalizeEmail(email);
      const secret = String(password ?? '').trim();
      if (!current?.auth_user_id) {
        if (current && !secret) return { userId: null, created: false, notice: '' };
        return create(address, secret);
      }
      if (secret) await setPassword(current.auth_user_id, secret);
      if (address !== normalizeEmail(current.email)) await setEmail(current.auth_user_id, address);
      return { userId: current.auth_user_id, created: false, notice: '' };
    },

    /** La fiche n'a pas pu être enregistrée : retire le compte, seulement s'il vient d'être créé. */
    async undo(account) {
      if (account?.created) await remove(account.userId).catch(() => null);
    },
  };
};
