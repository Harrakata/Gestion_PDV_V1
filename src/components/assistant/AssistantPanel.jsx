import React, { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowUp, ArrowUpRight, BookOpen, Bot, Loader2, MessageCircle, RefreshCw, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ASSISTANT_GUIDES, assistantGuideReply, assistantSuggestions, guideReply, normalizeAssistantText } from '../../../supabase/functions/_shared/assistantKnowledge.js';
import { getCacheSummary, getQueueSummary } from '@/lib/offlineQueue';
import AssistantGuideBrowser from './AssistantGuideBrowser';
import './assistant.css';

const menuCacheKey = (space, identity) => space && identity ? `assistant-menus:${space}:${identity}` : null;

const readCachedMenus = (space, identity) => {
  const key = menuCacheKey(space, identity);
  if (!key) return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCachedMenus = (space, identity, menus) => {
  const key = menuCacheKey(space, identity);
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify(Array.isArray(menus) ? menus : [])); } catch { /* noop */ }
};

const clearCachedMenus = (space, identity) => {
  const key = menuCacheKey(space, identity);
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch { /* noop */ }
};

const localDataReply = async (question, currentTab, menus) => {
  const normalized = normalizeAssistantText(question);
  const asksForLocalData = /(sans ia|donnees? locales?|cache|synchron|operation.*attente|hors ligne|page actuelle|contexte actuel)/.test(normalized);
  if (!asksForLocalData) return guideReply(question, currentTab, menus);

  const [queue, cache] = await Promise.all([getQueueSummary(), getCacheSummary()]);
  const queueTypes = Object.entries(queue.byType || {}).map(([type, count]) => `${type} : ${count}`).join(', ');
  const cacheDate = cache.latestUpdatedAt ? new Date(cache.latestUpdatedAt).toLocaleString('fr-FR') : 'aucun instantané';
  const page = String(currentTab || 'page courante').split('-').join(' ');
  return {
    mode: 'guide',
    answer: [
      'Données disponibles sans IA',
      `Page actuelle : ${page}.`,
      `Guide métier : ${ASSISTANT_GUIDES.length} fiches consultables et interrogeables.`,
      `Synchronisation locale : ${queue.count} opération(s) en attente${queue.failed ? `, dont ${queue.failed} en erreur` : ''}${queueTypes ? ` (${queueTypes})` : ''}.`,
      `Cache local : ${cache.count} instantané(s), dernière mise à jour : ${cacheDate}.`,
      'Les états métier en temps réel qui ne sont pas déjà en cache nécessitent une connexion au service concerné.',
    ].join('\n'),
    sources: [{ id: 'offline', title: 'Mode hors ligne et synchronisation', path: menus.find((menu) => menu.key === 'activites-et-audit')?.path || null }],
  };
};

export default function AssistantPanel({ space, currentTab, authenticated, identity, aiConnectionEnabled = true, request, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [capabilities, setCapabilities] = useState(() => ({ mode: 'guide', menus: readCachedMenus(space, identity) }));
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState('conversation');
  const pending = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const effectiveMode = online && aiConnectionEnabled ? capabilities.mode : 'guide';
  const menus = capabilities.menus || [];
  const currentMenu = menus.find((menu) => menu.key === currentTab);

  useEffect(() => {
    const connect = () => setOnline(true);
    const disconnect = () => { setOnline(false); pending.current?.abort(); };
    const rightsChanged = () => { pending.current?.abort(); clearCachedMenus(space, identity); setMessages([]); setCapabilities({ mode: 'guide', menus: [] }); setRevision((value) => value + 1); };
    window.addEventListener('online', connect);
    window.addEventListener('offline', disconnect);
    window.addEventListener('app-functionalities-updated', rightsChanged);
    return () => {
      pending.current?.abort();
      window.removeEventListener('online', connect);
      window.removeEventListener('offline', disconnect);
      window.removeEventListener('app-functionalities-updated', rightsChanged);
    };
  }, [identity, space]);

  useEffect(() => {
    if (!open) return;
    if (!aiConnectionEnabled) {
      pending.current?.abort();
      setCapabilities((previous) => ({ mode: 'guide', menus: previous.menus }));
      setNotice('');
      setChecking(false);
      return;
    }
    if (!authenticated || !space || !online) {
      setCapabilities((previous) => ({ mode: 'guide', menus: authenticated && space ? previous.menus : [] }));
      setNotice(!online ? 'Hors ligne : guide, contexte de page et données locales restent disponibles.' : '');
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    setChecking(true);
    request({ action: 'capabilities', space }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setCapabilities(result);
      writeCachedMenus(space, identity, result.menus);
      setNotice(result.notice || '');
    }).catch((error) => {
      if (controller.signal.aborted) return;
      const authorizationError = [401, 403].includes(error.status);
      setCapabilities((previous) => ({ mode: 'guide', menus: authorizationError ? [] : previous.menus }));
      setNotice(authorizationError ? error.message : 'IA indisponible. Le guide et les données locales restent accessibles.');
      if (authorizationError) { clearCachedMenus(space, identity); setMessages([]); }
    }).finally(() => { clearTimeout(timer); if (!controller.signal.aborted) setChecking(false); });
    const abortListener = () => { setChecking(false); setCapabilities((previous) => ({ mode: 'guide', menus: previous.menus })); setNotice('Connexion IA interrompue. Le guide et les données locales restent accessibles.'); };
    controller.signal.addEventListener('abort', abortListener);
    return () => { clearTimeout(timer); controller.signal.removeEventListener('abort', abortListener); controller.abort(); };
  }, [open, authenticated, identity, space, online, aiConnectionEnabled, request, revision]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy, open, view]);

  const readGuide = (guide) => {
    if (busy) return;
    const reply = assistantGuideReply(guide.id, menus);
    setMessages((previous) => [...previous, { role: 'user', content: guide.title },
      { role: 'assistant', content: reply.answer, mode: 'guide', sources: reply.sources }]);
    setView('conversation');
  };

  const send = async (question = draft) => {
    const text = question.trim();
    if (!text || text.length > 4000 || busy || checking) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setDraft('');
    setBusy(true);
    const controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const reply = effectiveMode === 'ai'
        ? await request({ action: 'chat', space, currentTab, messages: next.slice(-7).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })) }, controller.signal)
        : await localDataReply(text, currentTab, menus);
      if (controller.signal.aborted) return;
      if (typeof reply.answer !== 'string') throw new Error('Réponse indisponible.');
      setMessages((previous) => [...previous, { role: 'assistant', content: reply.answer, mode: reply.mode, sources: reply.sources || [], incomplete: reply.incomplete }]);
      if (reply.notice) setNotice(reply.notice);
    } catch (error) {
      if (controller.signal.aborted) return;
      if ([401, 403].includes(error.status)) {
        setMessages([]);
        setCapabilities({ mode: 'guide', menus: [] });
        setNotice(error.message);
      } else {
        setNotice(`${error.message} Vous pouvez réessayer ou consulter le guide.`);
        const fallback = await localDataReply(text, currentTab, menus);
        setMessages((previous) => [...previous, { role: 'assistant', content: fallback.answer, mode: 'guide', sources: fallback.sources }]);
      }
    } finally {
      clearTimeout(timer);
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
        if (controller.signal.aborted) setNotice('Réponse interrompue. Vous pouvez poser une nouvelle question.');
      }
    }
  };

  const reset = () => { pending.current?.abort(); pending.current = null; setBusy(false); setMessages([]); setDraft(''); setView('conversation'); inputRef.current?.focus(); };
  const suggestions = assistantSuggestions(currentTab);

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild>
      <button type="button" aria-label="Ouvrir l’assistant" title="Assistant GestionPDV"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:bottom-6 md:right-6">
        <MessageCircle className="h-6 w-6" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay data-operational-assistant-overlay className="fixed inset-0 z-50 bg-black/10 backdrop-blur-none" />
      <Dialog.Content data-operational-assistant onOpenAutoFocus={(event) => { if (inputRef.current) { event.preventDefault(); inputRef.current.focus(); } }}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-50 flex h-[min(680px,85dvh)] w-[calc(100vw-1.5rem)] max-w-[440px] flex-col overflow-hidden rounded-2xl border text-foreground shadow-2xl outline-none md:right-6">
        <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 bg-primary" />
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-white text-primary shadow-sm">
            <Bot className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-base font-semibold text-primary">Assistant GestionPDV</Dialog.Title>
            <Dialog.Description className={aiConnectionEnabled ? 'truncate text-xs text-muted-foreground' : 'sr-only'}>{checking ? 'Connexion…' : effectiveMode === 'ai' ? 'IA · Consultation en lecture seule' : aiConnectionEnabled ? 'Guide intégré · Données locales' : 'Assistant en mode guide local'}</Dialog.Description>
          </div>
          <Dialog.Close asChild><Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 rounded-full bg-white shadow-sm" title="Fermer l’assistant" aria-label="Fermer l’assistant"><X className="h-4 w-4" /></Button></Dialog.Close>
        </header>
        {currentMenu && <p className="mx-4 mb-3 shrink-0 truncate rounded-lg border border-primary/15 bg-white px-3 py-2 text-xs text-muted-foreground" title={currentMenu.title}>Page : {currentMenu.title}</p>}
        {notice && aiConnectionEnabled && <div className="mx-4 mb-3 flex shrink-0 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          <p className="min-w-0 flex-1 break-words">{notice}</p>
          {authenticated && online && space && aiConnectionEnabled && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Reconnecter l’IA" aria-label="Reconnecter l’IA" disabled={checking || busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="h-3.5 w-3.5" /></Button>}
        </div>}
        <Tabs value={view} onValueChange={setView} className="flex min-h-0 flex-1 flex-col">
          <TabsList aria-label="Rubriques de l’assistant" className="mx-4 mb-3 grid shrink-0 grid-cols-2 rounded-xl border-white bg-white p-1.5 shadow-sm">
            <TabsTrigger value="conversation" className="min-w-0 gap-2 rounded-lg px-2 text-xs"><MessageCircle className="h-4 w-4 shrink-0" />Conversation</TabsTrigger>
            <TabsTrigger value="guides" className="min-w-0 gap-2 rounded-lg px-2 text-xs"><BookOpen className="h-4 w-4 shrink-0" />Fiches pratiques</TabsTrigger>
          </TabsList>
          <TabsContent value="guides" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            <AssistantGuideBrowser currentTab={currentTab} menus={menus} busy={busy} onRead={readGuide} onNavigate={(path) => { setOpen(false); onNavigate(path); }} />
          </TabsContent>
          <TabsContent value="conversation" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" role="log" aria-label="Conversation avec l’assistant" aria-live="polite" aria-relevant="additions text">
          {messages.length > 0 && <Button type="button" variant="ghost" size="sm" className="mb-3 -ml-2 gap-2" onClick={reset}><ArrowLeft className="h-4 w-4" />Accueil</Button>}
          {!messages.length && <div className="space-y-4">
            <p className="text-sm font-medium">Bonjour, quelle est votre question ?</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white px-4 shadow-sm">{suggestions.map((guide) => <button key={guide.id} type="button" disabled={busy} onClick={() => readGuide(guide)} className="flex w-full items-center justify-between gap-2 border-b border-slate-200 py-3 text-left text-sm last:border-b-0 hover:text-primary disabled:opacity-50"><span>{guide.title}</span><ArrowUpRight className="h-4 w-4 shrink-0" /></button>)}</div>
            <button type="button" onClick={() => setView('guides')} className="flex items-center gap-2 text-sm text-primary hover:underline"><BookOpen className="h-4 w-4" />Toutes les fiches pratiques</button>
          </div>}
          <div className="space-y-5">{messages.map((message, index) => <article key={index} className={message.role === 'user' ? 'ml-8 rounded-lg bg-primary/10 px-3 py-2' : 'min-w-0'}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{message.role === 'user' ? 'Vous' : message.mode === 'ai' ? 'Assistant IA' : 'Guide intégré'}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{message.content}</p>
            {message.incomplete && <p className="mt-2 text-xs text-amber-700">Réponse partielle. Précisez votre question pour poursuivre.</p>}
            {message.sources?.length > 0 && <div className="mt-3 space-y-1 border-t pt-2">{message.sources.map((source, sourceIndex) => {
              const safePath = menus.some((menu) => menu.path === source.path) ? source.path : null;
              return <div key={source.id || sourceIndex} className="min-w-0 text-xs text-muted-foreground">
                {safePath ? <button type="button" className="flex max-w-full items-center gap-1 text-left text-primary hover:underline" onClick={() => { setOpen(false); onNavigate(safePath); }}><BookOpen className="h-3 w-3 shrink-0" /><span className="break-words">{source.title}</span><ArrowUpRight className="h-3 w-3 shrink-0" /></button>
                  : <span className="break-words">Source : {source.title}</span>}
                {source.consultedAt && <p>Consulté le {new Date(source.consultedAt).toLocaleString('fr-FR')}{source.truncated ? ' · Extrait limité' : ''}</p>}
              </div>;
            })}</div>}
          </article>)}</div>
          {busy && <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Recherche en cours…</p>}
        </div>
        <form className="shrink-0 space-y-2 border-t border-primary/15 bg-transparent px-4 py-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <label htmlFor="assistant-question" className="sr-only">Votre question</label>
          <div className="flex items-end gap-2">
            <Textarea ref={inputRef} id="assistant-question" rows={2} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Votre question…" className="max-h-28 min-h-[64px] min-w-0 resize-none bg-white shadow-sm" onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
            }} />
            {busy ? <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Arrêter la réponse" aria-label="Arrêter la réponse" onClick={() => pending.current?.abort()}><Square className="h-4 w-4" /></Button>
              : <Button type="submit" size="icon" className="h-10 w-10 shrink-0" title="Envoyer la question" aria-label="Envoyer la question" disabled={!draft.trim() || checking}><ArrowUp className="h-4 w-4" /></Button>}
          </div>
          {aiConnectionEnabled && <p className="text-[11px] text-muted-foreground">{effectiveMode === 'ai' ? 'Questions et données autorisées utiles traitées par le service IA.' : 'Guide métier, page courante, cache et synchronisation disponibles sans IA.'}</p>}
        </form>
          </TabsContent>
        </Tabs>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
