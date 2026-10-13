import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, CloudOff, Database, FileClock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCacheSummary, getQueueSummary, subscribeQueue } from '@/lib/offlineQueue';
import { ASSISTANT_GUIDES } from '../../../supabase/functions/_shared/assistantKnowledge.js';

const PAGE_LABELS = {
  'centre-operationnel': "Centre d'actions",
  'maintenance-terminaux': 'Maintenance des Terminaux',
  'activites-et-audit': 'Activités et Audit',
  'profils-exploitation': 'Profil et Fonctionnalité',
  agences: 'Agences',
  guichetieres: 'Guichetières',
  techniciens: 'Techniciens',
  regions: 'Régions',
  secteurs: 'Secteurs',
  'terminaux-mobi': 'Terminaux Mobi',
  'points-vente-mobi': 'Points de Vente Mobi',
  'chiffres-daffaires': "Chiffres d'affaires",
  'etat-caisse': 'État de caisse',
  tickets: 'Tickets et incidents',
  rapports: 'Rapports',
  planning: 'Planning',
  'suivi-pointage': 'Suivi des pointages',
};

const pageLabel = (key) => PAGE_LABELS[key] || String(key || 'Page courante')
  .split('-').filter(Boolean).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');

const formatTime = (timestamp) => timestamp
  ? new Date(timestamp).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Aucun instantané';

export default function AssistantLocalOverview({ currentTab, online: onlineProp, embedded = false }) {
  const [queue, setQueue] = useState({ count: 0, failed: 0, oldestCreatedAt: null });
  const [cache, setCache] = useState({ count: 0, latestUpdatedAt: null });
  const [loading, setLoading] = useState(false);
  const [detectedOnline, setDetectedOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const online = typeof onlineProp === 'boolean' ? onlineProp : detectedOnline;

  const refresh = useCallback(async () => {
    setLoading(true);
    const [nextQueue, nextCache] = await Promise.all([getQueueSummary(), getCacheSummary()]);
    setQueue(nextQueue);
    setCache(nextCache);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    const onSync = () => refresh();
    window.addEventListener('offline-queue-synced', onSync);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      unsubscribe();
      window.removeEventListener('offline-queue-synced', onSync);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (typeof onlineProp === 'boolean') return undefined;
    const connect = () => setDetectedOnline(true);
    const disconnect = () => setDetectedOnline(false);
    window.addEventListener('online', connect);
    window.addEventListener('offline', disconnect);
    return () => {
      window.removeEventListener('online', connect);
      window.removeEventListener('offline', disconnect);
    };
  }, [onlineProp]);

  return (
    <section className={embedded ? 'mt-4 border-t border-slate-200 pt-3' : 'overflow-hidden rounded-xl border border-primary/15 bg-white shadow-sm'} aria-label="Informations disponibles sans intelligence artificielle">
      <div className={embedded ? 'flex items-center gap-2 pb-2.5' : 'flex items-center gap-2 border-b px-3 py-2.5'}>
        <Database className="h-4 w-4 text-primary" />
        <h2 className="min-w-0 flex-1 text-xs font-semibold text-foreground">Données accessibles sans IA</h2>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading} aria-label="Actualiser les données locales" title="Actualiser">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <dl className={embedded ? 'grid overflow-hidden rounded-lg border bg-background/50 text-xs sm:grid-cols-2' : 'divide-y text-xs'}>
        <div className="flex items-start gap-3 px-3 py-2.5">
          {online ? <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
          <dt className="w-24 shrink-0 text-muted-foreground">Contexte</dt>
          <dd className="min-w-0 flex-1 font-medium text-foreground">{pageLabel(currentTab)} · {online ? 'Réseau disponible' : 'Hors ligne'}</dd>
        </div>
        <div className="flex items-start gap-3 px-3 py-2.5">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <dt className="w-24 shrink-0 text-muted-foreground">Guide métier</dt>
          <dd className="min-w-0 flex-1 font-medium text-foreground">{ASSISTANT_GUIDES.length} fiches consultables et interrogeables</dd>
        </div>
        <div className="flex items-start gap-3 px-3 py-2.5">
          <FileClock className={`mt-0.5 h-4 w-4 shrink-0 ${queue.failed ? 'text-red-600' : queue.count ? 'text-amber-600' : 'text-emerald-600'}`} />
          <dt className="w-24 shrink-0 text-muted-foreground">Synchronisation</dt>
          <dd className="min-w-0 flex-1 font-medium text-foreground">
            {queue.count
              ? `${queue.count} opération(s) en attente${queue.failed ? ` · ${queue.failed} en erreur` : ''}${Object.keys(queue.byType || {}).length ? ` · ${Object.entries(queue.byType).map(([type, count]) => `${type}: ${count}`).join(', ')}` : ''}`
              : 'Aucune opération en attente'}
          </dd>
        </div>
        <div className="flex items-start gap-3 px-3 py-2.5">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <dt className="w-24 shrink-0 text-muted-foreground">Cache local</dt>
          <dd className="min-w-0 flex-1 font-medium text-foreground">{cache.count} instantané(s) · {formatTime(cache.latestUpdatedAt)}</dd>
        </div>
      </dl>
    </section>
  );
}
