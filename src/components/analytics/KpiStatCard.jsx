import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { resolveSemanticTone } from '@/lib/designSystem';

const TONE_STYLES = {
  primary: {
    iconWrap: 'bg-primary/10 text-primary ring-primary/20',
    border: 'border-primary/20',
    rail: 'bg-primary',
  },
  success: {
    iconWrap: 'bg-success-muted text-success-muted-foreground ring-success/20',
    border: 'border-success/20',
    rail: 'bg-success',
  },
  info: {
    iconWrap: 'bg-info-muted text-info-muted-foreground ring-info/20',
    border: 'border-info/20',
    rail: 'bg-info',
  },
  warning: {
    iconWrap: 'bg-warning-muted text-warning-muted-foreground ring-warning/20',
    border: 'border-warning/25',
    rail: 'bg-warning',
  },
  danger: {
    iconWrap: 'bg-destructive/10 text-destructive ring-destructive/20',
    border: 'border-destructive/20',
    rail: 'bg-destructive',
  },
  neutral: {
    iconWrap: 'bg-muted text-muted-foreground ring-border',
    border: 'border-border',
    rail: 'bg-muted-foreground',
  },
};

const KpiStatCard = ({ icon, label, value, helper = '', tone = 'primary', solid = true, className = '' }) => {
  const semanticTone = resolveSemanticTone(tone, 'primary');
  const toneStyle = TONE_STYLES[semanticTone] || TONE_STYLES.primary;
  const isIconElement = React.isValidElement(icon);
  const Icon = isIconElement ? null : icon;

  return (
    <Card
      glass={false}
      className={cn(
        'kpi-stat-card relative overflow-hidden border shadow-soft',
        solid ? 'bg-card' : 'bg-card/80 backdrop-blur-md',
        toneStyle.border,
        className,
      )}
    >
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1', toneStyle.rail)} />
      <CardContent className="relative px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 sm:h-10 sm:w-10', toneStyle.iconWrap)}>
            {isIconElement ? React.cloneElement(icon, { className: 'h-4 w-4 sm:h-5 sm:w-5' }) : null}
            {Icon ? <Icon className="h-4 w-4 sm:h-5 sm:w-5" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase leading-tight tracking-[0.05em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold leading-none tracking-tight text-foreground sm:text-2xl">{value}</p>
            {helper ? <p className="mt-1.5 hidden text-xs leading-4 text-muted-foreground sm:block">{helper}</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiStatCard;
