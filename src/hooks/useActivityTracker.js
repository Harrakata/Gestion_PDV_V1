import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  bumpActivityNavigation,
  buildActivityIdentity,
  endActivitySession,
  logActivityEvent,
  prettifyActivityPath,
  startActivitySession,
  touchActivitySession,
} from '@/lib/userActivity';
import { setMonitoringContext } from '@/lib/monitoring';
import { createNavigationLog } from '@/lib/navigationLog';
import { resources } from '@/lib/resourceMode';
import { WATCH_EVENT } from '@/hooks/useSpaceNotifications';

const { presence: HEARTBEAT_INTERVAL_MS, presenceWhenHidden, navigation } = resources;

const saveNavigation = (events) => {
  const { sessionId, path, navCount } = events[events.length - 1];
  bumpActivityNavigation(sessionId, { path, navCount });
  logActivityEvent(events);
};

/** Clôture la session avec les navigations encore en attente. */
const closeSession = (sessionId, navigationLog) => {
  const events = navigationLog.take();
  if (events.length) logActivityEvent(events);
  endActivitySession(sessionId, events[events.length - 1]);
};

const SESSION_STORAGE_PREFIX = 'ps:activity:session:';

const readStoredSession = (spaceKey) => {
  try {
    const raw = sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${spaceKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStoredSession = (spaceKey, value) => {
  try {
    if (value) {
      sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${spaceKey}`, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(`${SESSION_STORAGE_PREFIX}${spaceKey}`);
    }
  } catch {
    /* sessionStorage indisponible : on ignore */
  }
};

/**
 * Instrumente un espace applicatif pour journaliser l'activité utilisateur :
 *   - création / reprise de session (état temps réel)
 *   - heartbeat périodique (last_seen_at)
 *   - évènements de navigation entre onglets de l'espace
 *   - clôture de session à la déconnexion / fermeture
 *
 * @param {object}  params
 * @param {string}  params.spaceKey      ex. 'espace-exploitation'
 * @param {boolean} params.isAuthenticated
 * @param {object}  params.identity      données utilisateur brutes de l'espace
 *                                        (voir buildActivityIdentity)
 */
export function useActivityTracker({ spaceKey, isAuthenticated, identity }) {
  const location = useLocation();

  const sessionIdRef = useRef(null);
  const navCountRef = useRef(0);
  const lastPathRef = useRef(null);
  const creatingRef = useRef(false);
  const startingPromiseRef = useRef(null);
  const lastBeatRef = useRef(0);
  const navigationRef = useRef(null);
  navigationRef.current ||= createNavigationLog({ ...navigation, save: saveNavigation });

  // Identité normalisée (recalculée à chaque rendu mais stable via la clé).
  const normalizedIdentity = buildActivityIdentity(identity);
  const identityRef = useRef(normalizedIdentity);
  identityRef.current = normalizedIdentity;

  const userKey = normalizedIdentity?.userKey || null;

  // Contexte de monitoring : chaque erreur remontée indique l'espace et
  // l'identifiant technique de l'utilisateur (ni nom ni e-mail).
  useEffect(() => {
    if (!isAuthenticated || !userKey) return undefined;
    setMonitoringContext({ space: spaceKey, userKey });
    return () => setMonitoringContext(null);
  }, [isAuthenticated, userKey, spaceKey]);
  const active = Boolean(isAuthenticated && spaceKey && userKey);

  // Déconnexion : on clôture la session courante si elle existe.
  const endOnLogoutRef = useRef(null);
  endOnLogoutRef.current = () => {
    const sessionId = sessionIdRef.current || readStoredSession(spaceKey)?.id;
    if (sessionId) {
      if (identityRef.current) {
        logActivityEvent({
          sessionId,
          spaceKey,
          identity: identityRef.current,
          eventType: 'logout',
          path: lastPathRef.current,
          label: 'Déconnexion',
        });
      }
      closeSession(sessionId, navigationRef.current);
    }
    sessionIdRef.current = null;
    navCountRef.current = 0;
    lastPathRef.current = null;
    writeStoredSession(spaceKey, null);
  };

  // Se déconnecter quitte aussitôt l'espace : on n'attend pas le rendu suivant.
  useEffect(() => {
    const onLogout = (event) => { if (event.detail === spaceKey) endOnLogoutRef.current(); };
    window.addEventListener(WATCH_EVENT, onLogout);
    return () => window.removeEventListener(WATCH_EVENT, onLogout);
  }, [spaceKey]);

  // ── Démarrage / clôture de session ────────────────────────
  useEffect(() => {
    if (!active) {
      endOnLogoutRef.current();
      return;
    }

    const ensureSession = async () => {
      // Garde StrictMode / double-rendu : une seule création concurrente.
      if (creatingRef.current || sessionIdRef.current) return;
      creatingRef.current = true;

      const currentPath = location.pathname;
      lastPathRef.current = currentPath;

      // Reprise d'une session existante (rechargement de page même onglet).
      const stored = readStoredSession(spaceKey);
      if (stored?.id && stored.userKey === userKey) {
        sessionIdRef.current = stored.id;
        navCountRef.current = stored.navCount || 0;
        creatingRef.current = false;
        touchActivitySession(stored.id, { path: currentPath });
        return;
      }

      const promise = startActivitySession({
        spaceKey,
        identity: identityRef.current,
        path: currentPath,
      });
      startingPromiseRef.current = promise;
      const newId = await promise;
      creatingRef.current = false;
      // On assigne même si l'effet a été nettoyé (StrictMode) : assigner une ref
      // est sans effet de bord et évite les sessions orphelines en base.
      if (!newId) return;

      sessionIdRef.current = newId;
      navCountRef.current = 0;
      writeStoredSession(spaceKey, { id: newId, userKey, navCount: 0 });
      logActivityEvent({
        sessionId: newId,
        spaceKey,
        identity: identityRef.current,
        eventType: 'login',
        path: currentPath,
        label: prettifyActivityPath(currentPath),
      });
    };

    ensureSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, spaceKey, userKey]);

  // ── Heartbeat ─────────────────────────────────────────────
  useEffect(() => {
    if (!active) return undefined;
    lastBeatRef.current = Date.now();
    const beat = () => {
      if (!sessionIdRef.current) return;
      if (!presenceWhenHidden && document.visibilityState === 'hidden') return;
      lastBeatRef.current = Date.now();
      touchActivitySession(sessionIdRef.current, { path: lastPathRef.current });
    };
    // Retour à l'écran après une pause : le signal manqué part aussitôt.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastBeatRef.current >= HEARTBEAT_INTERVAL_MS) beat();
    };
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);

  // ── Navigation entre onglets de l'espace ──────────────────
  useEffect(() => {
    if (!active) return;
    const currentPath = location.pathname;
    if (lastPathRef.current === currentPath) return;

    // Première navigation = chemin initial déjà couvert par l'évènement login.
    const isInitial = lastPathRef.current === null;
    lastPathRef.current = currentPath;
    if (isInitial) return;

    const applyNavigation = (sessionId) => {
      if (!sessionId) return;
      navCountRef.current += 1;
      const stored = readStoredSession(spaceKey);
      if (stored?.id === sessionId) {
        writeStoredSession(spaceKey, { ...stored, navCount: navCountRef.current });
      }
      navigationRef.current.add({
        sessionId,
        spaceKey,
        identity: identityRef.current,
        eventType: 'navigation',
        path: currentPath,
        label: prettifyActivityPath(currentPath),
        navCount: navCountRef.current,
      });
    };

    if (sessionIdRef.current) {
      applyNavigation(sessionIdRef.current);
    } else if (startingPromiseRef.current) {
      // Session encore en cours de création : on attend son id.
      startingPromiseRef.current.then((id) => applyNavigation(id || sessionIdRef.current));
    }
     
  }, [location.pathname, active, spaceKey]);

  // ── Sortie de l'espace : navigations en attente ───────────
  useEffect(() => {
    const navigationLog = navigationRef.current;
    return () => navigationLog.flush();
  }, []);

  // ── Clôture best-effort à la fermeture de l'onglet ────────
  useEffect(() => {
    if (!active) return undefined;
    const handlePageHide = () => {
      const sessionId = sessionIdRef.current;
      if (sessionId) closeSession(sessionId, navigationRef.current);
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [active]);
}

export default useActivityTracker;
