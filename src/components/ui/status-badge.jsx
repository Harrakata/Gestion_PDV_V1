import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { resolveSemanticTone, toneForStatus } from '@/lib/designSystem';

const VARIANT_BY_TONE = {
  primary: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  neutral: 'neutral',
};

const DOT_BY_TONE = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
};

/** Badge de statut accessible et indépendant des noms de couleurs. */
export function StatusBadge({
  children,
  status,
  tone,
  icon,
  showDot = true,
  className,
  ...props
}) {
  const resolvedTone = tone
    ? resolveSemanticTone(tone)
    : toneForStatus(status || children);
  const label = children ?? status;

  return (
    <Badge
      variant={VARIANT_BY_TONE[resolvedTone] || 'neutral'}
      className={cn('max-w-full whitespace-normal leading-tight sm:whitespace-nowrap', className)}
      {...props}
    >
      {icon || (showDot ? <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_BY_TONE[resolvedTone])} /> : null)}
      <span>{label}</span>
    </Badge>
  );
}

export default StatusBadge;

