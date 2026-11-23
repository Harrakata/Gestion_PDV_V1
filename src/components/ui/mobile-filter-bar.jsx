import { useId, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Libellés d'une sélection multiple (`Combobox multi`) ; un périmètre verrouillé n'est pas un tableau. */
export const filterLabels = (values, options) => Array.isArray(values)
  && values.map((value) => options.find((option) => option.value === value)?.label ?? value).join(', ');

/**
 * Barre de filtres du téléphone : une ligne (recherche + bouton « Filtres »), les
 * filtres se déplient dessous sur deux colonnes. Repliée, elle rappelle ce qui est
 * filtré : un filtre caché ne doit jamais passer inaperçu.
 * À n'afficher que sur téléphone (`useIsPhone`) ; l'ordinateur garde ses filtres visibles.
 *
 * Sans `onSearchChange`, la ligne entière est le bouton « Filtres ».
 *
 * @param {string} [p.search]
 * @param {(value: string) => void} [p.onSearchChange]
 * @param {string} [p.searchLabel]   ce que couvre la recherche (lecteurs d'écran)
 * @param {Array<string|null|false>} [p.active]  libellés des filtres actifs
 * @param {string} [p.context]       rappel toujours affiché (période…), non compté
 * @param {() => void} [p.onReset]
 * @param {React.ReactNode} [p.actions]  boutons-icônes en bout de ligne (colonnes…)
 */
const MobileFilterBar = ({ search, onSearchChange, searchLabel = 'Rechercher', searchPlaceholder = 'Rechercher…', active = [], context, onReset, actions, disabled, className, children }) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const labels = active.filter(Boolean);
  const summary = [context, ...labels].filter(Boolean).join(' · ');
  const name = labels.length ? `Filtres, ${labels.length} actif(s)` : 'Filtres';

  return (
    <div data-mobile-filters className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-2">
        {onSearchChange && <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="w-full pl-8"
            disabled={disabled}
          />
        </div>}
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={onSearchChange || !summary ? name : `${name} : ${summary}`}
          onClick={() => setOpen((value) => !value)}
          className={cn('gap-1.5 px-3', onSearchChange ? 'shrink-0' : 'min-w-0 flex-1 justify-start', (open || labels.length > 0) && 'border-primary/50 bg-primary/5 text-primary')}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtres
          {labels.length > 0 && (
            <span aria-hidden="true" className="rounded-pill bg-primary/15 px-1.5 text-xs font-bold leading-4">{labels.length}</span>
          )}
          {!onSearchChange && (
            <>
              <span className="min-w-0 flex-1 truncate text-right text-xs font-normal text-muted-foreground">{summary}</span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
            </>
          )}
        </Button>
        {actions}
      </div>

      {onSearchChange && !open && summary && <p className="truncate px-1 text-xs text-muted-foreground" title={summary}>{summary}</p>}

      <div id={panelId} hidden={!open}>
        {open && (
          <div className="grid grid-cols-2 gap-2 [&>*]:w-full [&>*]:min-w-0">
            {children}
            {onReset && labels.length > 0 && (
              <Button type="button" variant="ghost" size="sm" className="col-span-2" onClick={onReset} disabled={disabled}>
                Effacer les filtres
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileFilterBar;
