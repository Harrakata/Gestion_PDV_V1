import React, { useEffect, useState } from 'react';
import { CloudOff, Cloud, RefreshCw } from 'lucide-react';
import { getQueueSummary, subscribeQueue, OFFLINE_FEATURE_KEY } from '@/lib/offlineQueue';
import { flushQueue } from '@/lib/offlineSync';
import { cachedQuery } from '@/lib/offlineCache';
import { supabase } from '@/lib/supabaseClient';
import { APP_SPACE_SETTINGS_KEY } from '@/lib/exploitationProfiles';
import MaSynchroDialog from '@/components/MaSynchroDialog';

/**
 * Indicateur de synchronisation hors-ligne.
 * - Affiche « Hors ligne » quand pas de connexion.
 * - Affiche le nombre d'opérations en attente + un bouton pour synchroniser.
 * - Masqué quand on est en ligne et qu'il n'y a rien en attente.
 */
const OfflineSyncIndicator = () => {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [offlineEnabled, setOfflineEnabled] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    // Mis en cache : le badge « Hors ligne » doit pouvoir s'afficher… hors-ligne.
    cachedQuery(
      'offline-indicator:space-settings',
      () => supabase.from('app_settings').select('value').eq('key', APP_SPACE_SETTINGS_KEY).maybeSingle(),
    )
      .then(({ data }) => setOfflineEnabled(data?.value?.[OFFLINE_FEATURE_KEY] === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => getQueueSummary()
      .then((summary) => {
        if (!active) return;
        setCount(summary.count);
        setFailed(summary.failed);
      })
      .catch(() => {});
    refresh();
    const unsub = subscribeQueue(refresh);
    const onOnline = () => { setOnline(true); flushQueue().finally(refresh); };
    const onOffline = () => setOnline(false);
    const onSyncStarted = () => setSyncing(true);
    const onSynced = (event) => {
      setSyncing(false);
      setLastResult(event.detail || null);
      refresh();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('offline-queue-sync-started', onSyncStarted);
    window.addEventListener('offline-queue-synced', onSynced);
    const interval = setInterval(refresh, 8000);
    return () => {
      active = false;
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('offline-queue-sync-started', onSyncStarted);
      window.removeEventListener('offline-queue-synced', onSynced);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!lastResult) return undefined;
    const timer = setTimeout(() => setLastResult(null), 8000);
    return () => clearTimeout(timer);
  }, [lastResult]);

  // Badge « Hors ligne » seulement si la fonctionnalité est activée.
  const showOfflineBadge = !online && offlineEnabled;
  // Rien à montrer si en ligne sans file, ou hors-ligne avec la fonctionnalité désactivée et file vide.
  if (!showOfflineBadge && count === 0 && !syncing && !lastResult) return null;

  const badgeClass = showOfflineBadge
    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
    : failed > 0
      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
      : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100';

  const label = (() => {
    if (syncing) return 'Synchronisation...';
    if (showOfflineBadge) return `Hors ligne${count > 0 ? ` · ${count}` : ''}${failed > 0 ? ` · ${failed} échec` : ''}`;
    if (failed > 0) return `${count} en attente · ${failed} échec`;
    if (count > 0) return `${count} en attente`;
    if (lastResult?.synced > 0) return `${lastResult.synced} synchronisé(s)`;
    return 'Synchro à jour';
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${badgeClass}`}
        title="Voir le détail de la synchronisation"
      >
        {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : showOfflineBadge ? <CloudOff className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
        {label}
      </button>
      <MaSynchroDialog open={detailsOpen} onOpenChange={setDetailsOpen} online={online} />
    </>
  );
};

export default OfflineSyncIndicator;
