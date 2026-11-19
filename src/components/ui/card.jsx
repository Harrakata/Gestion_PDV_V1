
import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'overflow-hidden rounded-2xl border text-card-foreground',
  {
    variants: {
      variant: {
        default: 'border-border bg-card shadow-soft',
        subtle: 'border-border/80 bg-surface-subtle shadow-none',
        elevated: 'border-border/80 bg-surface-elevated shadow-elevated',
        interactive: 'border-border bg-card shadow-soft transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevated',
        glass: 'surface-glass bg-card shadow-soft',
        // Carte « à liseré » : en-têtes d'écran et blocs principaux. Le liseré
        // est dessiné par le composant — ne plus l'ajouter à la main.
        accent: 'relative border-primary/20 bg-card shadow-[0_22px_60px_-30px_rgba(15,23,42,0.28)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Card = React.forwardRef(({ className, glass = false, variant, children, ...props }, ref) => {
  const resolvedVariant = variant || (glass ? 'glass' : 'default');
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ variant: resolvedVariant }), className)}
      {...props}
    >
      {resolvedVariant === 'accent' && (
        <span aria-hidden="true" data-card-rail className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-primary" />
      )}
      {children}
    </div>
  );
});
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-xl font-semibold leading-tight tracking-tight sm:text-2xl', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('card-description text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
