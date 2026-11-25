import { useEffect, useState } from 'react';
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
    conflict: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10',
    local: 'border-warning/30 bg-warning-muted text-warning-muted-foreground hover:bg-warning-muted',
    pending: 'border-info/30 bg-info-muted text-info-muted-foreground hover:bg-info-muted',
    synced: 'border-success/30 bg-success-muted text-success-muted-foreground hover:bg-success-muted',
  }[status.kind];
  const Icon = syncing ? RefreshCw : status.kind === 'conflict' ? AlertTriangle
    : status.kind === 'local' ? CloudOff : status.kind === 'synced' ? CheckCircle2 : RefreshCw;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold transition-colors ${badgeClass}`}
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
