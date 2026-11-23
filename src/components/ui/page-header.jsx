import React from 'react';
import { cn } from '@/lib/utils';

/** En-tête standard d'un écran métier : contexte, titre, aide et actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  icon,
  actions,
  className,
  children,
}) {
  return (
    <header className={cn('flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-soft">
            {React.isValidElement(icon) ? React.cloneElement(icon, { className: cn('h-5 w-5', icon.props.className) }) : icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</p> : null}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

export default PageHeader;

