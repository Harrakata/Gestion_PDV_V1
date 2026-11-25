import { supabase } from '@/lib/supabaseClient';
import { t } from '@/i18n/translate';

// ════════════════════════════════════════════════════════════════════════════
//  Notifications push (Web Push) — abonnement côté client.
//
//  Prérequis : VITE_VAPID_PUBLIC_KEY (clé publique VAPID du déploiement) + service
//  worker avec handlers push (public/push-sw.js, importé par Workbox) + Edge
//  Function `send-push` (envoi). Table : push_subscriptions.
// ════════════════════════════════════════════════════════════════════════════

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const TABLE = 'push_subscriptions';

/** Le navigateur supporte-t-il le push ? */
export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** Push configuré sur ce déploiement (clé VAPID présente) ? */
export const isPushConfigured = () => !!VAPID_PUBLIC_KEY;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const getRegistration = async () => {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
};

/** Permission de notification courante : 'granted' | 'denied' | 'default' | 'unsupported'. */
export const getPushPermission = () => (isPushSupported() ? Notification.permission : 'unsupported');

// Abonnement de l'appareil, ou null. Sans service worker enregistré (serveur de développement),
// `serviceWorker.ready` ne répondrait jamais : on interroge l'enregistrement.
const currentSubscription = async () => {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) || null;
  } catch {
    return null;
  }
};

/** Y a-t-il déjà un abonnement actif sur cet appareil ? */
export const hasPushSubscription = async () => Boolean(await currentSubscription());

// Personne à qui l'abonnement de cet appareil est rattaché.
const OWNER_KEY = 'push_subscription_owner';
const ownerOf = (endpoint, { id, role, agence, region }) => JSON.stringify([endpoint, id != null ? String(id) : null, role || null, agence || null, region || null]);
const readOwner = () => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } };
const writeOwner = (value) => {
  try { if (value) localStorage.setItem(OWNER_KEY, value); else localStorage.removeItem(OWNER_KEY); } catch { /* stockage indisponible */ }
};

const saveSubscription = async (subscription, reader = {}) => {
  const json = subscription.toJSON();
  const row = {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
    user_id: reader.id != null ? String(reader.id) : null,
    role: reader.role || null,
    agence_nom: reader.agence || null,
    region: reader.region || null,
    user_nom: reader.nom || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'endpoint' });
  if (!error) writeOwner(ownerOf(json.endpoint, reader));
};

/**
 * Rattache l'abonnement de cet appareil à la personne connectée (appareil partagé, changement
 * d'agence, fiche modifiée). N'écrit que si le rattachement a changé.
 */
export const syncPushOwner = async (reader = {}) => {
  if (!reader.role || reader.id == null || !isPushSupported() || !isPushConfigured()) return;
  const subscription = await currentSubscription();
  if (!subscription || readOwner() === ownerOf(subscription.endpoint, reader)) return;
  try { await saveSubscription(subscription, reader); } catch { /* hors-ligne : au prochain affichage */ }
};

/**
 * Active le push sur cet appareil : demande la permission, s'abonne, enregistre.
 * @returns { ok, reason? }
 */
export const subscribeToPush = async (reader = {}) => {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'not-configured' };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: permission };
    const reg = await getRegistration();
    if (!reg) return { ok: false, reason: 'no-sw' };
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscription(subscription, reader);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
};

/** Désactive le push sur cet appareil (désabonnement + suppression serveur). */
export const unsubscribeFromPush = async () => {
  try {
    const reg = await getRegistration();
    const subscription = reg && (await reg.pushManager.getSubscription());
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await supabase.from(TABLE).delete().eq('endpoint', endpoint);
      writeOwner(null);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
};

/**
 * Déclenche l'envoi d'une notification push ciblée via l'Edge Function `send-push`.
 * @param target { role?, agence_nom?, region?, user_id? } — au moins un critère (valeur ou liste)
 * @param payload { title, body, url?, tag? }
 */
export const triggerPush = async (target, payload) => {
  try {
    const translated = { ...payload, title: t(payload?.title), body: t(payload?.body) };
    await supabase.functions.invoke('send-push', { body: { target, payload: translated } });
  } catch {
    /* best-effort : ne bloque jamais le flux applicatif */
  }
};

/**
 * Notification push d'un message de l'exploitation déjà enregistré : la fonction lit elle-même
 * le texte et les destinataires, selon la même règle que la cloche.
 * @param roles rôles dont les notifications sont actives
 */
export const triggerMessagePush = async (messageId, roles) => {
  if (messageId == null || !roles?.length) return;
  try {
    await supabase.functions.invoke('send-push', { body: { message_id: messageId, roles } });
  } catch {
    /* best-effort : ne bloque jamais le flux applicatif */
  }
};
