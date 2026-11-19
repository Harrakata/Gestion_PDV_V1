// Monitoring d'erreurs en production via Sentry — entièrement OPTIONNEL.
// Sentry n'est chargé (import dynamique) que si VITE_SENTRY_DSN est défini :
//   → aucun impact sur le bundle ni l'exécution sans DSN.
// Pour l'activer : créer un projet Sentry, puis définir VITE_SENTRY_DSN
// (en local dans .env, en prod dans les variables d'environnement Vercel).
//
// Chaque erreur remontée porte le client (déploiement), l'espace et
// l'identifiant technique de l'utilisateur connecté (jamais son nom ni son
// e-mail) : on sait immédiatement où et pour qui elle se produit.
// Les erreurs non interceptées (exceptions, promesses rejetées) sont capturées
// automatiquement par le SDK Sentry.

import { CLIENT_ID } from '@/lib/clientConfig';

let sentry = null;
// Contexte posé avant le chargement (asynchrone) de Sentry : appliqué à l'init.
let pendingContext = null;

const applyContext = (ctx) => {
  if (!sentry) { pendingContext = ctx; return; }
  try {
    sentry.setUser(ctx?.userKey ? { id: ctx.userKey } : null);
    sentry.setTag('espace', ctx?.space || 'aucun');
  } catch { /* noop */ }
};

export async function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION || undefined,
      // Échantillonnage léger des traces de performance.
      tracesSampleRate: 0.1,
      // Pas de session replay par défaut (vie privée + coût).
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
    Sentry.setTag('client', CLIENT_ID);
    sentry = Sentry;
    if (pendingContext) applyContext(pendingContext);
  } catch {
    /* Le monitoring est optionnel : on n'interrompt jamais l'app. */
  }
}

/** Espace + utilisateur courants (appelé par useActivityTracker). null = déconnecté. */
export function setMonitoringContext(ctx) {
  applyContext(ctx);
}

export function captureError(error, context) {
  try {
    if (sentry && error) {
      sentry.captureException(error, context ? { extra: context, tags: context.where ? { origine: context.where } : undefined } : undefined);
    }
  } catch {
    /* noop */
  }
}

export function isMonitoringEnabled() {
  return Boolean(sentry);
}
