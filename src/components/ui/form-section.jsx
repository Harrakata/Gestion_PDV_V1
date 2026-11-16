import React from 'react';
import { cn } from '@/lib/utils';

/** Regroupe des champs liés avec un titre et une aide optionnelle. */
export function FormSection({ title, description, children, className }) {
  return (
    <fieldset className={cn('grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5', className)}>
      {title ? (
        <legend className="px-1 text-base font-semibold text-foreground">{title}</legend>
      ) : null}
      {description ? <p className="-mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {children}
    </fieldset>
  );
}

export default FormSection;

