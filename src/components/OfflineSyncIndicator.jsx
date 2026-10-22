import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw } from 'lucide-react';
import { getQueueSummary, subscribeQueue } from '@/lib/offlineQueue';
import { flushQueue } from '@/lib/offlineSync';
import { getOfflineSyncStatus } from '@/lib/offlineSyncStatus';
import MaSynchroDialog from '@/components/MaSynchroDialog';

const OfflineSyncIndicator = ({ enabled }) => {
  const [summary, setSummary] = useState(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const refresh = () => getQueueSummary()
      .then((next) => { if (active) setSummary(next); })
      .catch(() => {});
    refresh();
    const unsub = subscribeQueue(refresh);
    const onOnline = () => { setOnline(true); flushQueue().finally(refresh); };
    const onOffline = () => setOnline(false);
    const onSyncStarted = () => setSyncing(true);
    const onSynced = () => {
      setSyncing(false);
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setDetailsOpen(false);
      setSummary(null);
      setSyncing(false);
    }
  }, [enabled]);

  if (!enabled || !summary) return null;

  const status = getOfflineSyncStatus({ ...summary, online, syncing });
  const badgeClass = {
    conflict: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
    local: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    pending: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100',
    synced: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }[status.kind];
  const Icon = syncing ? RefreshCw : status.kind === 'conflict' ? AlertTriangle
    : status.kind === 'local' ? CloudOff : status.kind === 'synced' ? CheckCircle2 : RefreshCw;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${badgeClass}`}
        title="Voir le détail de la synchronisation"
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
        <span>{status.label}</span>
      </button>
      <MaSynchroDialog open={detailsOpen} onOpenChange={setDetailsOpen} online={online} />
    </>
  );
};

export default OfflineSyncIndicator;
