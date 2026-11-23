import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Database, Search } from 'lucide-react';

const GlobalSearchDialog = React.lazy(() => import('@/components/GlobalSearchDialog'));

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

/**
 * Recherche de la barre supérieure des espaces connectés : filtre les pages du
 * menu de l'espace courant ; dans l'espace Exploitation, propose aussi la
 * recherche dans les données (agences, terminaux, personnes).
 */
export default function SpaceHeaderSearch({ items, enableDataSearch = false, autoFocus = false, onDone }) {
  const navigate = useNavigate();
  const inputRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const listId = React.useId();
  const [term, setTerm] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dataSearchOpen, setDataSearchOpen] = React.useState(false);
  const [dataSearchTerm, setDataSearchTerm] = React.useState('');

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  React.useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && inputRef.current?.getClientRects().length) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  const query = normalize(term.trim());
  const results = React.useMemo(() => {
    const sourceItems = items ?? [];
    const matches = query
      ? sourceItems.filter((item) => normalize(`${item.label} ${item.group || ''} ${item.keywords || ''}`).includes(query))
      : sourceItems;
    const list = matches.slice(0, 8);
    if (enableDataSearch && query.length >= 2) {
      list.push({ key: 'data-search', label: `Rechercher « ${term.trim()} » dans les données`, group: 'Agences, terminaux, personnes', data: true });
    }
    return list;
  }, [enableDataSearch, items, query, term]);
  const highlightedIndex = Math.min(activeIndex, results.length - 1);

  const select = (item) => {
    if (!item) return;
    setOpen(false);
    setTerm('');
    inputRef.current?.blur();
    if (item.data) { setDataSearchTerm(term.trim()); setDataSearchOpen(true); return; }
    if (item.to) navigate(item.to);
    else item.onClick?.();
    onDone?.();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(Math.max(0, Math.min(highlightedIndex + 1, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(highlightedIndex - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(results[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <label className="space-header-search flex h-11 w-full items-center gap-2.5 rounded-pill px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => { setTerm(event.target.value); setActiveIndex(0); setOpen(true); }}
          onFocus={() => { setActiveIndex(0); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Rechercher…"
          aria-label="Rechercher dans l’espace"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs font-semibold text-muted-foreground lg:inline">Ctrl K</kbd>
      </label>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-floating"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Aucun résultat.</p>
          ) : results.map((item, index) => (
            <button
              key={item.key}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(item)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                index === highlightedIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
              }`}
            >
              {item.data
                ? <Database className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                : <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.label}</span>
                {item.group && <span className="block truncate text-xs text-muted-foreground">{item.group}</span>}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {enableDataSearch && dataSearchOpen && (
        <React.Suspense fallback={null}>
          <GlobalSearchDialog open={dataSearchOpen} onOpenChange={setDataSearchOpen} initialTerm={dataSearchTerm} />
        </React.Suspense>
      )}
    </div>
  );
}
