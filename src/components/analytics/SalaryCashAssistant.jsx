import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Download, RotateCcw, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/Combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePageState } from '@/hooks/usePageState';
import { downloadCsv } from '@/lib/csv';
import { DEFAULT_RECONCILIATION_FILTERS, filterReconciliationRows, summarizeReconciliation } from '@/lib/salaryReconciliation';

const amount = (value) => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const date = (value) => value ? new Date(value).toLocaleDateString('fr-FR') : 'Aucun';
const statusLabels = { missing: 'Manque', surplus: 'Surplus', ok: 'Rapproché' };

function FilterSelect({ label, value, onChange, options }) {
  return <label className="block min-w-0 space-y-1 text-xs text-muted-foreground">
    <span>{label}</span>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 w-full min-w-0 bg-white [&>span]:truncate"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}</SelectContent>
    </Select>
  </label>;
}

function IconButton({ label, children, ...props }) {
  return <Button type="button" variant="outline" size="icon" title={label} aria-label={label} className="h-9 w-9 shrink-0" {...props}>{children}</Button>;
}

export default function SalaryCashAssistant({ rows, month, loading, error, onMonthChange, onOpenPrepose, onOpenDetail }) {
  const [savedFilters, setFilters] = usePageState('salary-cash-assistant', 'filters', DEFAULT_RECONCILIATION_FILTERS);
  const filters = useMemo(() => ({ ...DEFAULT_RECONCILIATION_FILTERS, ...savedFilters }), [savedFilters]);
  const [advanced, setAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('25');
  const [expanded, setExpanded] = useState(null);
  const resultsRef = useRef(null);
  const setFilter = (key, value) => { setFilters({ ...filters, [key]: value }); setPage(1); };
  const reset = () => { setFilters({ ...DEFAULT_RECONCILIATION_FILTERS }); setPage(1); };
  const invalidRange = filters.min !== '' && filters.max !== '' && Number(filters.min) > Number(filters.max);
  const filtered = useMemo(() => filterReconciliationRows(rows, filters), [rows, filters]);
  const summary = useMemo(() => summarizeReconciliation(filtered), [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / Number(pageSize)));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * Number(pageSize);
  const visibleRows = filtered.slice(start, start + Number(pageSize));
  useEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
  }, [currentPage, pageSize, filters, month.monthKey, loading]);
  const blocked = loading || Boolean(error);
  const optionsFor = (key, label) => [{ value: '__all__', label }, ...[...new Set(rows.map((row) => row[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr')).map((value) => ({ value, label: value }))];
  const activeFilters = [
    filters.search && { key: 'search', label: filters.search, reset: '' },
    filters.status !== 'gaps' && { key: 'status', label: ({ all: 'Tous dossiers', missing: 'Manques', surplus: 'Surplus', ok: 'Rapprochés' })[filters.status], reset: 'gaps' },
    ...[['agencies', 'Agences'], ['regions', 'Régions'], ['sectors', 'Secteurs']].filter(([key]) => filters[key].length)
      .map(([key, label]) => ({ key, label: `${label} : ${filters[key].join(', ')}`, reset: [] })),
    filters.identity !== 'all' && { key: 'identity', label: filters.identity === 'known' ? 'Identifiés' : 'Non identifiés', reset: 'all' },
    filters.source !== 'all' && { key: 'source', label: ({ no_payment: 'Sans versement', no_operations: 'Sans opération', both: 'Deux sources' })[filters.source], reset: 'all' },
    filters.min !== '' && { key: 'min', label: `Écart ≥ ${amount(filters.min)}`, reset: '' },
    filters.max !== '' && { key: 'max', label: `Écart ≤ ${amount(filters.max)}`, reset: '' },
  ].filter(Boolean);

  const exportRows = () => downloadCsv(filtered, [
    { key: 'periode', label: 'Période', value: () => month.monthKey },
    { key: 'code', label: 'Code préposé' }, { key: 'nom', label: 'Nom et prénom' },
    { key: 'agence', label: 'Agence actuelle' }, { key: 'region', label: 'Région' }, { key: 'secteur', label: 'Secteur' },
    { key: 'soldeCaisse', label: 'À verser' }, { key: 'mtVerse', label: 'Versé' }, { key: 'ecart', label: 'Écart' },
    { key: 'status', label: 'Statut', value: (row) => statusLabels[row.status] },
    { key: 'operationCount', label: 'Lignes CCOPE' }, { key: 'paymentCount', label: 'Versements' },
  ], `rapprochement-${month.monthKey}.csv`);

  return <section className="min-w-0 space-y-4 border-t border-blue-200 pt-4" aria-label="Assistant salaire/caisse" aria-busy={loading}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-primary"><Sparkles className="h-5 w-5 shrink-0" />Assistant salaire/caisse</h2>
        <p className="text-sm text-muted-foreground">{month.label} · Affectations actuelles</p>
      </div>
      <Button type="button" variant="outline" size="sm" className="gap-2" disabled={blocked || !filtered.length || invalidRange} onClick={exportRows}>
        <Download className="h-4 w-4" />Exporter les résultats
      </Button>
    </div>

    <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/20 px-1.5 py-1">
      <Input type="month" aria-label="Période de rapprochement" className="h-7 w-[10.5rem] shrink-0 border-none bg-transparent px-2 text-xs focus:bg-background focus:ring-1 focus:ring-primary/30" value={month.monthKey} onChange={(event) => {
        if (event.target.value) { setPage(1); setExpanded(null); onMonthChange(event.target.value); }
      }} />
      <div className="w-px h-5 bg-border mx-0.5" aria-hidden />
      <div className="relative min-w-[16rem] flex-1">
        <Search className="absolute left-3 top-1.5 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Rechercher un préposé" type="search" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Nom, code, agence, région, secteur…" className="h-7 min-w-0 border-transparent bg-transparent pl-9 text-xs focus:bg-background focus:ring-1 focus:ring-primary/30" />
      </div>
      <div className="w-40 shrink-0">
        <Select value={filters.status} onValueChange={(value) => setFilter('status', value)}>
          <SelectTrigger aria-label="Dossiers" className="h-7 w-full min-w-0 gap-1.5 border-transparent bg-transparent text-xs hover:bg-background focus:bg-background [&>span]:truncate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              ['gaps', 'Tous les écarts'], ['missing', 'Manques'], ['surplus', 'Surplus'], ['ok', 'Rapprochés'], ['all', 'Tous les dossiers'],
            ].map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="w-44 shrink-0">
        <Select value={filters.sort} onValueChange={(value) => setFilter('sort', value)}>
          <SelectTrigger aria-label="Trier par" className="h-7 w-full min-w-0 gap-1.5 border-transparent bg-transparent text-xs hover:bg-background focus:bg-background [&>span]:truncate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              ['gap_desc', 'Écart décroissant'], ['gap_asc', 'Écart croissant'], ['due_desc', 'À verser décroissant'], ['name', 'Nom et prénom'], ['agency', 'Agence'],
            ].map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" aria-expanded={advanced} aria-controls="salary-advanced-filters" onClick={() => setAdvanced(!advanced)}>
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtres{activeFilters.length ? ` (${activeFilters.length})` : ''}
        </Button>
        <Button type="button" variant="ghost" size="icon" title="Réinitialiser les filtres" aria-label="Réinitialiser les filtres" className="h-7 w-7 shrink-0" onClick={reset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>

    {advanced && <div id="salary-advanced-filters" className="grid min-w-0 gap-3 border-y py-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['regions', 'region', 'Régions'], ['sectors', 'secteur', 'Secteurs'], ['agencies', 'agence', 'Agences']].map(([key, field, label]) =>
        <div key={key} className="min-w-0 space-y-1 text-xs text-muted-foreground"><p>{label}</p>
          <Combobox multi options={optionsFor(field, label)} value={filters[key]} onSelect={(value) => setFilter(key, value)} placeholder={label} searchPlaceholder={`Rechercher : ${label.toLowerCase()}`} emptyText="Aucun résultat" />
        </div>)}
      <FilterSelect label="Correspondance" value={filters.match} onChange={(value) => setFilter('match', value)} options={[
        ['all', 'Tous les mots'], ['any', 'Au moins un mot'],
      ]} />
      <FilterSelect label="Identification" value={filters.identity} onChange={(value) => setFilter('identity', value)} options={[
        ['all', 'Tous les préposés'], ['known', 'Identifiés'], ['unknown', 'Non identifiés'],
      ]} />
      <FilterSelect label="Sources disponibles" value={filters.source} onChange={(value) => setFilter('source', value)} options={[
        ['all', 'Toutes les sources'], ['no_payment', 'Sans versement'], ['no_operations', 'Sans opération CCOPE'], ['both', 'CCOPE et versements'],
      ]} />
      {[['min', 'Écart minimum'], ['max', 'Écart maximum']].map(([key, label]) => <label key={key} className="min-w-0 space-y-1 text-xs text-muted-foreground">{label}
        <Input type="number" min="0" step="any" aria-label={label} aria-invalid={invalidRange} value={filters[key]} placeholder="Sans limite" className="h-9 w-full min-w-0 bg-white" onChange={(event) => setFilter(key, event.target.value === '' ? '' : String(Math.max(0, Number(event.target.value))))} />
      </label>)}
    </div>}

    {activeFilters.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Filtres actifs">{activeFilters.map((filter) =>
      <Badge key={filter.key} variant="outline" className="max-w-full gap-1 bg-white py-1 text-xs font-normal">
        <span className="min-w-0 truncate" title={filter.label}>{filter.label}</span>
        <button type="button" className="shrink-0 rounded p-1 hover:bg-slate-100" aria-label={`Retirer le filtre ${filter.label}`} title="Retirer ce filtre" onClick={() => setFilter(filter.key, filter.reset)}><X className="h-3 w-3" /></button>
      </Badge>)}</div>}

    {invalidRange && <p role="alert" className="text-sm text-red-700">Le montant minimum doit être inférieur ou égal au maximum.</p>}
    {error ? <div role="alert" className="border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-700">{error}<Button variant="outline" size="sm" className="ml-3" onClick={() => onMonthChange(month.monthKey)}>Réessayer</Button></div>
      : loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Chargement du rapprochement de {month.label}…</p>
      : <>
        <div className="grid gap-3 border-y bg-white/60 py-3 sm:grid-cols-3" aria-label="Totaux des résultats filtrés">
          {[[summary.due, 'À verser', 'text-blue-700'], [summary.paid, 'Versé', 'text-emerald-700'], [summary.gap, 'Écart net', summary.gap < 0 ? 'text-red-700' : 'text-emerald-700']].map(([value, label, color]) =>
            <div key={label} className="min-w-0 px-3"><p className="text-xs text-muted-foreground">{label} · sélection</p><p className={`break-words text-xl font-semibold tabular-nums ${color}`}>{amount(value)}</p></div>)}
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground" role="status">
          <p>{filtered.length} dossier(s) retenu(s) sur {rows.length} · {summary.unknown} non identifié(s)</p>
          <p>Manques : <span className="font-semibold text-red-700">{amount(summary.missing)}</span> · Surplus : <span className="font-semibold text-emerald-700">{amount(summary.surplus)}</span></p>
        </div>

        <div ref={resultsRef} className="max-h-[64vh] w-full min-w-0 divide-y overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200/80 bg-white shadow-[0_18px_45px_-32px_rgba(15,23,42,0.22)]" tabIndex={0} aria-label="Résultats du rapprochement">
          <div className="sticky top-0 z-10 hidden min-h-12 grid-cols-[minmax(16rem,2fr)_repeat(3,minmax(10rem,1fr))_6rem] items-center gap-3 border-b border-slate-200/80 bg-slate-50 px-5 py-2 text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
            <span>Préposé / agence</span><span className="text-center">À verser</span><span className="text-center">Versé</span><span className="text-center">Écart</span><span className="text-center">Détail</span>
          </div>
          {visibleRows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">
            <p>{rows.length ? 'Aucun dossier ne correspond aux filtres.' : 'Aucune opération ni aucun versement sur cette période.'}</p>
            {rows.length > 0 && <Button variant="ghost" size="sm" onClick={reset}>Réinitialiser les filtres</Button>}
          </div> : visibleRows.map((row) => <div key={row.code}>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 md:grid-cols-[minmax(16rem,2fr)_repeat(3,minmax(10rem,1fr))_6rem] md:px-5">
              <button type="button" className="min-w-0 text-left hover:text-primary focus-visible:outline-primary" onClick={() => onOpenPrepose(row.code)} title={`Ouvrir le préposé ${row.code}`}>
                <p className="break-words text-sm font-semibold">{row.nom}</p>
                <p className="break-words text-xs text-muted-foreground">{row.code} · {row.agence || 'Agence non renseignée'}</p>
                {(row.region || row.secteur) && <p className="break-words text-xs text-muted-foreground">{[row.region, row.secteur].filter(Boolean).join(' · ')}</p>}
              </button>
              <div className="col-span-2 grid grid-cols-3 gap-2 text-center text-sm tabular-nums md:contents">
                <div className="min-w-0 break-words md:text-center"><span className="block text-xs text-muted-foreground md:hidden">À verser</span>{amount(row.soldeCaisse)}</div>
                <div className="min-w-0 break-words md:text-center"><span className="block text-xs text-muted-foreground md:hidden">Versé</span>{amount(row.mtVerse)}</div>
                <div className={`min-w-0 break-words font-semibold md:text-center ${row.status === 'missing' ? 'text-red-700' : 'text-emerald-700'}`}>
                  <span className="block text-xs font-normal">{statusLabels[row.status]}</span>{amount(row.absEcart)}
                </div>
              </div>
              <div className="col-start-2 row-start-1 flex justify-end gap-1 md:col-start-auto md:row-start-auto md:justify-center">
                <IconButton label={`Calcul du préposé ${row.code}`} aria-expanded={expanded === row.code} aria-controls={`salary-detail-${row.code}`} onClick={() => setExpanded(expanded === row.code ? null : row.code)}><ChevronDown className={`h-4 w-4 ${expanded === row.code ? 'rotate-180' : ''}`} /></IconButton>
                <IconButton label={`Ouvrir le préposé ${row.code}`} onClick={() => onOpenPrepose(row.code)}><ArrowRight className="h-4 w-4" /></IconButton>
              </div>
            </div>
            {expanded === row.code && <div id={`salary-detail-${row.code}`} className="grid gap-3 bg-slate-50 px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <p>Enregistré : <strong>{amount(row.mtEnr)}</strong><br />Annulé : <strong>{amount(row.mtAnnule)}</strong></p>
              <p>Avances : <strong>{amount(row.avance)}</strong><br />Retraits : <strong>{amount(row.retrait)}</strong></p>
              <p>{row.operationCount} ligne(s) CCOPE<br />Dernière opération : {date(row.lastOperation)}</p>
              <p>{row.paymentCount} versement(s)<br />Dernier versement : {date(row.lastPayment)}</p>
              <p className="sm:col-span-2 lg:col-span-4">À verser = enregistré − annulé + avances − retraits. Écart = versé − à verser.</p>
            </div>}
          </div>)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{filtered.length ? start + 1 : 0}–{Math.min(start + Number(pageSize), filtered.length)} sur {filtered.length}</p>
          <div className="flex flex-wrap items-end gap-2">
            <FilterSelect label="Par page" value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} options={['25', '50', '100'].map((value) => [value, value])} />
            <IconButton label="Page précédente" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></IconButton>
            <span className="py-2 text-xs">{currentPage} / {pageCount}</span>
            <IconButton label="Page suivante" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></IconButton>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onOpenDetail}>Ouvrir le détail du mois<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </>}
  </section>;
}
