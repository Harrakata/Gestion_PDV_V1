import React, { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/Combobox';
import { cn } from '@/lib/utils';

/**
 * Champ de formulaire accessible : le libellé reste visible et les textes
 * d'aide/erreur sont automatiquement reliés au contrôle enfant.
 *
 * `inline` : gain de place — le libellé n'est plus affiché au-dessus du champ
 * (il reste lu par les lecteurs d'écran) mais DANS le champ : en texte indicatif
 * tant qu'il est vide, puis en préfixe de la valeur choisie pour un Combobox
 * (« Type : 2020 »). Le libellé doit alors être une chaîne.
 */
export function FormField({ id, label, hint, error, required = false, inline = false, className, children }) {
  const generatedId = useId();
  const childId = React.isValidElement(children) ? children.props.id : undefined;
  const controlId = id || childId || `field-${generatedId.replace(/:/g, '')}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const inlineText = inline && typeof label === 'string' ? `${label}${required ? ' *' : ''}` : null;
  const inlineProps = inlineText
    ? {
        placeholder: inlineText,
        ...(children?.type === Combobox ? { valueLabel: label } : {}),
      }
    : {};
  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: controlId,
        required: children.props.required ?? required,
        'aria-describedby': [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
        'aria-invalid': children.props['aria-invalid'] ?? Boolean(error),
        ...inlineProps,
      })
    : children;

  return (
    <div className={cn(inline ? 'grid gap-1' : 'grid gap-2', className)}>
      <Label htmlFor={controlId} className={inline ? 'sr-only' : undefined}>
        {label}
        {required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}
        {required ? <span className="sr-only"> (obligatoire)</span> : null}
      </Label>
      {control}
      {hint ? <p id={hintId} className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      {error ? <p id={errorId} className="text-xs font-medium leading-5 text-destructive">{error}</p> : null}
    </div>
  );
}

export default FormField;

