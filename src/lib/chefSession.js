import { CHEF_AGENCE_AUTH_STORAGE_KEY } from '@/lib/supabaseClient';

// Connexion du chef d'agence mémorisée sur l'appareil ('pmuChefAuth').
//
// Elle ne vaut que si une session Supabase l'accompagne, c'est-à-dire si un mot de passe a
// été vérifié. La lecture est locale : elle fonctionne hors-ligne, et Supabase retire la
// session de l'appareil à la déconnexion ou quand elle est révoquée.
export const CHEF_AUTH_KEY = 'pmuChefAuth';

const readJson = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

const hasChefSession = () => Boolean(readJson(CHEF_AGENCE_AUTH_STORAGE_KEY)?.access_token);

/** Connexion mémorisée, ou null. Une connexion sans session vérifiée est effacée. */
export const readChefAuth = () => {
  const auth = readJson(CHEF_AUTH_KEY);
  if (!auth) return null;
  if (hasChefSession()) return auth;
  try { localStorage.removeItem(CHEF_AUTH_KEY); } catch { /* stockage indisponible */ }
  return null;
};
