import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, FileText } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

/** Palette de navigation globale, sans accès aux données métier. */
export default function AppNavigationDialog({ open, onOpenChange, groups, currentPath }) {
  const navigate = useNavigate();

  const goTo = (path) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Rechercher une page ou un espace…" aria-label="Rechercher dans la navigation" />
      <CommandList className="max-h-[min(26rem,65vh)]">
        <CommandEmpty>Aucune destination trouvée.</CommandEmpty>
        {(groups || []).map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => {
              const active = item.to === '/'
                ? currentPath === '/'
                : currentPath.startsWith(item.to);
              return (
                <CommandItem
                  key={item.to}
                  value={`${item.label} ${item.keywords || ''}`}
                  onSelect={() => goTo(item.to)}
                  className="min-h-11 cursor-pointer gap-3 rounded-lg px-3"
                >
                  <span className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
                    active && 'bg-primary/10 text-primary',
                  )}>
                    {React.isValidElement(item.icon)
                      ? React.cloneElement(item.icon, { className: 'h-4 w-4' })
                      : <FileText className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {active ? (
                    <CommandShortcut className="flex items-center gap-1 normal-case tracking-normal text-primary">
                      <Check className="h-3.5 w-3.5" /> Actuel
                    </CommandShortcut>
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>↑↓ pour naviguer · Entrée pour ouvrir</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans">Échap</kbd>
      </div>
    </CommandDialog>
  );
}

