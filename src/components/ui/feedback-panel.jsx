import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveSemanticTone } from '@/lib/designSystem';

const META = {
  success: { Icon: CheckCircle2, className: 'border-success/25 bg-success-muted text-success-muted-foreground' },
  warning: { Icon: AlertTriangle, className: 'border-warning/30 bg-warning-muted text-warning-muted-foreground' },
  danger: { Icon: AlertCircle, className: 'border-destructive/25 bg-destructive/10 text-destructive' },
  info: { Icon: Info, className: 'border-info/25 bg-info-muted text-info-muted-foreground' },
  primary: { Icon: Info, className: 'border-primary/25 bg-primary/10 text-primary' },
  neutral: { Icon: Info, className: 'border-border bg-muted text-muted-foreground' },
};

/** Message contextuel uniforme pour information, succès, avertissement ou erreur. */
export function FeedbackPanel({ tone = 'info', title, description, icon, actions, className, role, children }) {
  const resolvedTone = resolveSemanticTone(tone, 'info');
  const meta = META[resolvedTone] || META.info;
  const Icon = meta.Icon;

  return (
    <div
      role={role || (resolvedTone === 'danger' ? 'alert' : 'status')}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', meta.className, className)}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icon || <Icon className="h-5 w-5" />}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-current">{title}</p> : null}
        {description ? <p className={cn('leading-6', title && 'mt-0.5')}>{description}</p> : null}
        {children}
        {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export default FeedbackPanel;

