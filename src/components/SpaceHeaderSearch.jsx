import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Database, Search } from 'lucide-react';

const GlobalSearchDialog = React.lazy(() => import('@/components/GlobalSearchDialog'));

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

// Repli générique : entrées visibles du menu latéral de l'espace courant
// (espaces dont la navigation est en onglets internes, sans routes dédiées).
const collectSidebarItems = () => {
  const nodes = document.querySelectorAll('.app-space-sidebar nav a, .app-space-sidebar nav button:not([aria-expanded])');
  const seen = new Set();
  return Array.from(nodes).reduce((items, el) => {
    const label = (el.innerText || el.textContent || '').split('\n')[0].replace(/\s*\d+$/, '').trim();
    if (!label || seen.has(label)) return items;
    seen.add(label);
    items.push({ key: `dom-${items.length}`, label, group: 'Menu', el });
    return items;
  }, []);
};

/**
 * Recherche de la barre supérieure des espaces connectés : filtre les pages du
 * menu de l'espace courant ; dans l'espace Exploitation, propose aussi la
 * recherche dans les données (agences, terminaux, personnes).
 */
export default function SpaceHeaderSearch({ items, enableDataSearch = false, autoFocus = false, onDone }) {
  const navigate = useNavigate();
  const inputRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const [term, setTerm] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [sourceItems, setSourceItems] = React.useState([]);
  const [dataSearchOpen, setDataSearchOpen] = React.useState(false);
  const [dataSearchTerm, setDataSearchTerm] = React.useState('');

  const refreshSource = React.useCallback(() => {
    setSourceItems(items?.length ? items : collectSidebarItems());
  }, [items]);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  React.useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
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
    const matches = query
      ? sourceItems.filter((item) => normalize(`${item.label} ${item.group || ''} ${item.keywords || ''}`).includes(query))
      : sourceItems;
    const list = matches.slice(0, 8);
    if (enableDataSearch && query.length >= 2) {
      list.push({ key: 'data-search', label: `Rechercher « ${term.trim()} » dans les données`, group: 'Agences, terminaux, personnes', data: true });
    }
    return list;
  }, [enableDataSearch, query, sourceItems, term]);

  const select = (item) => {
    if (!item) return;
    setOpen(false);
    setTerm('');
    inputRef.current?.blur();
    if (item.data) { setDataSearchTerm(term.trim()); setDataSearchOpen(true); return; }
    if (item.to) navigate(item.to);
    else item.el?.click();
    onDone?.();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(results[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <label className="space-header-search flex h-11 w-full items-center gap-2.5 rounded-full px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => { setTerm(event.target.value); setActiveIndex(0); setOpen(true); }}
          onFocus={() => { refreshSource(); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Rechercher…"
          aria-label="Rechercher dans l’espace"
          role="combobox"
          aria-expanded={open}
          aria-controls="space-header-search-results"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground lg:inline">Ctrl K</kbd>
      </label>

      {open && (
        <div
          id="space-header-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 shadow-floating"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Aucun résultat.</p>
          ) : results.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(item)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                index === activeIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
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
