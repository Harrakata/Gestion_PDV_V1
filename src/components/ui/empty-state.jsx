import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/** État vide partagé, avec explication et action facultative. */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Aucun élément',
  description,
  action,
  secondaryAction,
  compact = false,
  className,
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-subtle text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-soft">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
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

