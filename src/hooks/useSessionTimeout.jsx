import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

/**
 * Déconnexion automatique après une période d'inactivité.
 *
 * Utilisé par TOUS les espaces connectés (terminaux partagés en agence : une
 * session oubliée ne doit pas rester ouverte).
 *
 * Conception :
 *  - L'activité (clic, touche, toucher, défilement) est mémorisée dans une ref :
 *    elle ne provoque AUCUN re-rendu (l'ancien hook redessinait tout l'espace à
 *    chaque événement de défilement).
 *  - Contrôle toutes les 5 s, et immédiatement au retour au premier plan
 *    (téléphone réveillé après une longue veille → expiration immédiate).
 *  - L'expiration ne se déclenche qu'UNE fois par session (l'ancien hook
 *    rappelait la déconnexion chaque seconde une fois expiré).
 *  - `enabled: false` (utilisateur non connecté) neutralise tout.
 *
 * @param {number|null} sessionDurationMinutes  durée d'inactivité tolérée ;
 *        null → durée configurée dans Paramètres (app_settings.general.sessionDureeMinutes).
 * @param {function} onTimeout       déconnexion à exécuter à l'expiration.
 * @param {string}   authStorageKey  clé localStorage de la session à purger.
 * @param {{ enabled?: boolean }} options
 * @returns {{ sessionExpiring, timeRemaining, formatTimeRemaining, resetTimer }}
 */

const DEFAULT_MINUTES = 30;
const WARNING_MS = 2 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

// Durée configurée, chargée une seule fois pour toute l'application.
let configuredMinutesPromise = null;
const loadConfiguredMinutes = () => {
  if (!configuredMinutesPromise) {
    configuredMinutesPromise = supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'general')
      .maybeSingle()
      .then(({ data }) => Number(data?.value?.sessionDureeMinutes) || DEFAULT_MINUTES)
      .catch(() => DEFAULT_MINUTES);
  }
  return configuredMinutesPromise;
};

export const useSessionTimeout = (sessionDurationMinutes = DEFAULT_MINUTES, onTimeout, authStorageKey, options = {}) => {
  const { enabled = true } = options;
  const { toast } = useToast();
  const [configuredMinutes, setConfiguredMinutes] = useState(DEFAULT_MINUTES);
  const [sessionExpiring, setSessionExpiring] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_MINUTES * 60);

  const lastActivityRef = useRef(Date.now());
  const warnedRef = useRef(false);
  const expiredRef = useRef(false);
  // Toujours la dernière version des callbacks, sans relancer l'effet principal.
  const onTimeoutRef = useRef(onTimeout);
  const toastRef = useRef(toast);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  useEffect(() => {
    if (sessionDurationMinutes != null) return undefined;
    let active = true;
    loadConfiguredMinutes().then((m) => { if (active) setConfiguredMinutes(m); });
    return () => { active = false; };
  }, [sessionDurationMinutes]);

  const minutes = sessionDurationMinutes ?? configuredMinutes;

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    setSessionExpiring((prev) => (prev ? false : prev));
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Nouvelle session à la prochaine connexion.
      expiredRef.current = false;
      warnedRef.current = false;
      setSessionExpiring(false);
      return undefined;
    }

    lastActivityRef.current = Date.now();
    expiredRef.current = false;
    warnedRef.current = false;
    const durationMs = Math.max(1, minutes) * 60 * 1000;

    const check = () => {
      if (expiredRef.current) return;
      const timeLeft = durationMs - (Date.now() - lastActivityRef.current);

      if (timeLeft <= 0) {
        expiredRef.current = true;
        setSessionExpiring(false);
        setTimeRemaining(0);
        try { if (authStorageKey) localStorage.removeItem(authStorageKey); } catch { /* stockage indisponible */ }
        onTimeoutRef.current?.();
        toastRef.current({
          title: 'Session expirée',
          description: 'Votre session a expiré par inactivité. Veuillez vous reconnecter.',
          variant: 'destructive',
          duration: 5000,
        });
        return;
      }

      if (timeLeft <= WARNING_MS) {
        setSessionExpiring(true);
        setTimeRemaining(Math.floor(timeLeft / 1000));
        if (!warnedRef.current) {
          warnedRef.current = true;
          toastRef.current({
            title: 'Session expirante',
            description: `Votre session expirera dans ${Math.ceil(timeLeft / 60000)} minute(s) par inactivité.`,
            variant: 'warning',
            duration: 10000,
          });
        }
      } else if (warnedRef.current) {
        // Activité reprise pendant l'avertissement.
        warnedRef.current = false;
        setSessionExpiring(false);
      }
    };

    const onActivity = () => { lastActivityRef.current = Date.now(); };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, minutes, authStorageKey]);

  const formatTimeRemaining = useCallback(() => {
    const m = Math.floor(timeRemaining / 60);
    const s = timeRemaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [timeRemaining]);

  return { sessionExpiring, timeRemaining, formatTimeRemaining, resetTimer };
};
