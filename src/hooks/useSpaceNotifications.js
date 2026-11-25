import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { joinSpaceNotifications, hasSpaceSession } from '@/features/notifications/notificationsHub';
import { isLocalNotifEnabled, notifyLocal } from '@/lib/localNotifications';
import { hasPushSubscription } from '@/lib/pushNotifications';
import { isNotifTypeEnabled, isSpaceNotifEnabled } from '@/lib/notificationSettings';

// Racine de chaque espace (pour ouvrir la cloche à la ré-ouverture depuis une notif message).
const SPACE_ROOTS = {
  'espace-guichetiere': '/espace-guichetiere',
  'espace-technicien': '/espace-technicien',
  'espace-chef-agence': '/espace-chef-agence',
  'espace-chef-secteur': '/espace-chef-secteur',
  'espace-directeur-regional': '/espace-validation-paiement-gain',
  'espace-directeur-general': '/espace-directeur-general',
  'espace-exploitation': '/espace-exploitation',
};

// Signature d'une notification (pour détecter les nouveautés entre deux rafraîchissements).
const notifSignatures = (n) =>
  n.messages?.length ? n.messages.map((m) => `m:${m.id}`) : [`${n.key}:${n.count}`];

// Persistance des signatures « déjà vues » (survit aux refresh/navigations) → permet
// de déclencher une notif OS pour ce qui est apparu pendant l'absence.
const SEEN_PREFIX = 'notif_seen_';
const loadSeen = (spaceKey) => {
  try { const raw = localStorage.getItem(SEEN_PREFIX + spaceKey); return raw ? new Set(JSON.parse(raw)) : null; }
  catch { return null; }
};
const saveSeen = (spaceKey, set) => {
  try { localStorage.setItem(SEEN_PREFIX + spaceKey, JSON.stringify([...set].slice(-200))); }
  catch { /* quota */ }
};

// Un « type poussé » = notification aussi envoyée en Web Push (message de l'exploitation,
// remontée terrain). Si un abonnement push existe sur l'appareil, le service worker l'affiche
// déjà (app ouverte OU fermée) → on NE refait PAS de notif locale, sinon doublon.
const isPushedType = (n, spaceKey) =>
  (n.messages?.length > 0 && !n.to) ||                              // messages de l'exploitation
  (spaceKey === 'espace-exploitation' && n.key === 'remontees');   // remontées terrain

// Type de réglage global (activer/désactiver) associé à une notification, ou null.
const notifSettingKey = (n, spaceKey) => {
  if (n.messages?.length > 0 && !n.to) return 'message';                          // messages exploitation
  if (spaceKey === 'espace-technicien' && n.key === 'tickets') return 'ticket_assigne';
  return null;
};

// Déclenche une notification OS (locale) pour chaque groupe contenant une nouveauté.
// La déduplication s'appuie sur l'état persisté (loadSeen/saveSeen).
async function fireLocalForNew(spaceKey, list) {
  const sigs = new Set(list.flatMap(notifSignatures));
  const prev = loadSeen(spaceKey); // null = 1re fois sur cet appareil → baseline (pas de rafale)
  // isSpaceNotifEnabled : coupe TOUTES les notifs locales d'un espace désactivé globalement.
  if (prev && isLocalNotifEnabled() && isSpaceNotifEnabled(spaceKey)) {
    // Abonnement push actif ? → le push couvre déjà messages/remontées (ouvert comme fermé).
    let pushActive = false;
    try { pushActive = await hasPushSubscription(); } catch { /* pas de SW / pas d'abonnement */ }
    let fired = 0;
    for (const n of list) {
      if (fired >= 3) break; // évite les rafales
      if (!notifSignatures(n).some((s) => !prev.has(s))) continue; // rien de nouveau ici
      // Type désactivé globalement (Exploitation → Notifications) → on n'alerte pas.
      const settingKey = notifSettingKey(n, spaceKey);
      if (settingKey && !isNotifTypeEnabled(settingKey)) continue;
      // Déjà couvert par le Web Push → pas de notif locale (évite le doublon push + local).
      if (pushActive && isPushedType(n, spaceKey)) continue;
      // Message sans page dédiée → ouvrir la cloche (racine d'espace + marqueur).
      const isMsg = n.messages?.length > 0 && !n.to;
      notifyLocal(n.title, {
        body: n.description || '',
        url: isMsg ? SPACE_ROOTS[spaceKey] : (n.to || undefined),
        openBell: isMsg,
        tag: n.key,
      });
      fired++;
    }
  }
  saveSeen(spaceKey, sigs);
}

// ── Descripteurs de surveillance (permet de continuer à notifier hors de la page) ──
// Chaque espace enregistre { context, ts } pendant qu'il est ouvert. La surveillance
// globale (Layout) rejoue ces descripteurs → notifications même sur l'accueil / un autre
// espace. TTL de sécurité : au-delà, on cesse (ex. session oubliée). La déconnexion
// appelle clearNotifWatch pour couper immédiatement.
const WATCH_KEY = 'notif_watch';
const WATCH_TTL_MS = 12 * 60 * 60 * 1000;
export const WATCH_EVENT = 'notif-watch-cleared'; // déconnexion d'un espace (detail : sa clé)
export const BELL_OPENED_EVENT = 'notif-bell-opened';
const WATCH_CHECK_MS = 10 * 60 * 1000;

const writeNotifWatch = (spaceKey, context = {}) => {
  if (!spaceKey) return;
  try {
    const map = JSON.parse(localStorage.getItem(WATCH_KEY) || '{}');
    map[spaceKey] = { context: context || {}, ts: Date.now() };
    localStorage.setItem(WATCH_KEY, JSON.stringify(map));
  } catch { /* quota / indisponible */ }
};

export const clearNotifWatch = (spaceKey) => {
  try {
    const map = JSON.parse(localStorage.getItem(WATCH_KEY) || '{}');
    if (map[spaceKey]) { delete map[spaceKey]; localStorage.setItem(WATCH_KEY, JSON.stringify(map)); }
    window.dispatchEvent(new CustomEvent(WATCH_EVENT, { detail: spaceKey }));
  } catch { /* ignore */ }
};

const readNotifWatches = () => {
  try {
    const map = JSON.parse(localStorage.getItem(WATCH_KEY) || '{}');
    const now = Date.now();
    return Object.entries(map)
      .filter(([, v]) => v && now - (v.ts || 0) < WATCH_TTL_MS)
      .map(([spaceKey, v]) => ({ spaceKey, context: v.context || {} }));
  } catch { return []; }
};

// Nouvelles données d'un espace (une seule fois par lecture, quel que soit le nombre d'écrans).
const onSpaceList = (spaceKey, context, list, complete) => {
  // Lecture incomplète (panne passagère) : on n'alerte pas, sinon ce qui manque
  // paraîtrait nouveau à la lecture suivante.
  if (complete) fireLocalForNew(spaceKey, list);
};

/**
 * Hook par-espace : alimente la cloche (état `notifications`) et tient à jour le descripteur
 * de surveillance globale. Les données viennent d'un flux unique par espace, partagé avec la
 * surveillance globale (cf. notificationsHub) : temps réel, sinon lecture espacée.
 *
 * @param {object}  params
 * @param {string}  params.spaceKey   ex. 'espace-exploitation'
 * @param {boolean} params.enabled
 * @param {object}  params.context    données de rôle (agence, ids, matricule…)
 */
export function useSpaceNotifications({ spaceKey, enabled = true, context = {} }) {
  const [notifications, setNotifications] = useState([]);
  const subscriptionRef = useRef(null);
  const ctxRef = useRef(context);
  ctxRef.current = context;

  // Clé stable pour relancer le calcul quand le contexte significatif change.
  const ctxKey = JSON.stringify(context || {});

  useEffect(() => {
    if (!enabled || !spaceKey) {
      setNotifications([]);
      return undefined;
    }
    const subscription = joinSpaceNotifications(spaceKey, ctxRef.current, {
      onList: (list) => {
        writeNotifWatch(spaceKey, ctxRef.current); // maintient vivant le descripteur (ts rafraîchi)
        setNotifications(list);
      },
      onFreshList: onSpaceList,
    });
    subscriptionRef.current = subscription;
    window.addEventListener(BELL_OPENED_EVENT, subscription.freshen);
    return () => {
      subscriptionRef.current = null;
      window.removeEventListener(BELL_OPENED_EVENT, subscription.freshen);
      subscription.leave();
    };
  }, [enabled, spaceKey]);

  useEffect(() => { subscriptionRef.current?.setContext(JSON.parse(ctxKey)); }, [ctxKey, enabled, spaceKey]);

  const refresh = useCallback(() => subscriptionRef.current?.refresh(), []);

  const totalCount = useMemo(
    () => notifications.reduce((sum, n) => sum + (n.count || 0), 0),
    [notifications]
  );

  return { notifications, totalCount, refresh };
}

/**
 * Surveillance GLOBALE (à monter UNE fois dans Layout).
 * Suit les espaces ouverts récemment sur cet appareil et toujours connectés → les notifications
 * OS continuent de se déclencher sur l'accueil, dans un autre espace, ou onglet en arrière-plan
 * (tant que l'app tourne). ⚠ App totalement fermée = Web Push requis.
 * Un espace affiché n'est pas lu deux fois : le flux est partagé avec sa page.
 */
export function useGlobalNotificationWatcher() {
  const { pathname } = useLocation();
  const syncRef = useRef(null);

  useEffect(() => {
    // Rien à faire si le navigateur ne gère pas les notifications.
    if (typeof window === 'undefined' || !('Notification' in window)) return undefined;
    const joined = new Map();
    let round = 0;
    let disposed = false;

    const sync = async () => {
      const current = ++round;
      const watches = isLocalNotifEnabled() ? readNotifWatches() : [];
      const connected = [];
      for (const watch of watches) {
        if (await hasSpaceSession(watch.spaceKey)) connected.push(watch);
      }
      if (disposed || current !== round) return;
      const wanted = new Set(connected.map((watch) => watch.spaceKey));
      joined.forEach((subscription, spaceKey) => {
        if (!wanted.has(spaceKey)) { subscription.leave(); joined.delete(spaceKey); }
      });
      connected.forEach(({ spaceKey, context }) => {
        if (!joined.has(spaceKey)) joined.set(spaceKey, joinSpaceNotifications(spaceKey, context, { onFreshList: onSpaceList }));
      });
    };
    syncRef.current = sync;

    sync();
    const interval = setInterval(sync, WATCH_CHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(WATCH_EVENT, sync);
    return () => {
      disposed = true;
      syncRef.current = null;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(WATCH_EVENT, sync);
      joined.forEach((subscription) => subscription.leave());
    };
  }, []);

  // Changement d'écran : la page quittée passe le relais.
  useEffect(() => { syncRef.current?.(); }, [pathname]);
}

export default useSpaceNotifications;
