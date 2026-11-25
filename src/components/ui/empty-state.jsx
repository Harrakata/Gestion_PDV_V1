import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * État vide partagé, avec explication et action facultative.
 * `compact` : dans une carte ou une liste ; `plain` : sans cadre (cellule de tableau).
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Aucun élément',
  description,
  action,
  secondaryAction,
  compact = false,
  plain = false,
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', !plain && 'rounded-2xl border border-dashed border-border bg-surface-subtle', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-soft">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className={cn('font-semibold text-foreground', compact ? 'mt-3 text-sm' : 'mt-4 text-base')}>{title}</p>
      {description ? <p className="mt-1.5 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export default EmptyState;

