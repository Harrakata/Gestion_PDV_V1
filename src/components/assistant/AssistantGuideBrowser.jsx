import React, { useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronRight, MessageCircle, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ASSISTANT_GUIDES, ASSISTANT_GUIDE_CATEGORIES, listAssistantGuides } from '../../../supabase/functions/_shared/assistantKnowledge.js';

export default function AssistantGuideBrowser({ currentTab, menus, onRead, onNavigate, busy }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const guides = listAssistantGuides(query, category, currentTab);
  const guide = ASSISTANT_GUIDES.find((entry) => entry.id === selected);
  const menu = guide && menus.find((entry) => guide.tabs.includes(entry.key));

  if (guide) return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
    <Button type="button" variant="ghost" size="sm" className="mb-3 gap-2" onClick={() => setSelected(null)}><ArrowLeft className="h-4 w-4" />Toutes les fiches</Button>
    <article className="space-y-4 text-sm [overflow-wrap:anywhere]">
      <h2 className="text-base font-semibold" tabIndex={-1} ref={(element) => element?.focus()}>{guide.title}</h2>
      <p className="whitespace-pre-wrap leading-relaxed">{guide.text}</p>
      {guide.steps?.length > 0 && <ol className="list-decimal space-y-3 pl-5 leading-relaxed">{guide.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}</ol>}
      <div className="flex flex-col items-start gap-2 border-t pt-3">
        {menu && <Button type="button" variant="outline" className="h-auto min-h-9 max-w-full gap-2 whitespace-normal text-left" onClick={() => onNavigate(menu.path)}><ArrowUpRight className="h-4 w-4 shrink-0" /><span>Ouvrir {menu.title}</span></Button>}
        <Button type="button" variant="ghost" disabled={busy} className="h-auto min-h-9 max-w-full gap-2 whitespace-normal text-left" onClick={() => onRead(guide)}><MessageCircle className="h-4 w-4 shrink-0" />Reprendre dans la conversation</Button>
      </div>
    </article>
  </div>;

  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="shrink-0 space-y-2 border-b px-4 py-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Rechercher une fiche" placeholder="Agence, import, mot de passe…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 min-w-0 pl-9 pr-10" />
        {query && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" aria-label="Effacer la recherche" title="Effacer la recherche" onClick={() => setQuery('')}><X className="h-4 w-4" /></Button>}
      </div>
      <select aria-label="Thème des fiches" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
        <option value="all">Tous les thèmes</option>
        {ASSISTANT_GUIDE_CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select>
      <p className="text-xs text-muted-foreground" role="status">{guides.length} fiche(s)</p>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
      {guides.length ? <ul className="divide-y">{guides.map((entry) => <li key={entry.id}>
        <button type="button" className="flex w-full items-center gap-3 py-3 text-left hover:text-primary focus-visible:outline-primary" onClick={() => setSelected(entry.id)}>
          <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{entry.title}<span className="mt-1 block text-xs text-muted-foreground">{entry.steps?.length ? `${entry.steps.length} étapes` : 'Repères métier'}{currentTab && entry.tabs.includes(currentTab) ? ' · Page actuelle' : ''}</span></span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </button>
      </li>)}</ul> : <div className="space-y-3 py-6 text-sm">
        <p>Aucune fiche ne correspond à ces critères.</p>
        <Button type="button" variant="outline" onClick={() => { setQuery(''); setCategory('all'); }}>Réinitialiser les filtres</Button>
      </div>}
    </div>
  </div>;
}
