
import React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef(({ className, containerClassName, ...props }, ref) => (
  <div tabIndex={0} role="region" aria-label={props['aria-label'] ? `Tableau : ${props['aria-label']}` : 'Tableau défilant'} className={cn("app-table-scroll relative min-w-0 w-full max-w-full overflow-auto rounded-2xl border border-border/80 bg-card shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", containerClassName)}>
    <table
      ref={ref}
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-surface-subtle [&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('bg-card [&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn('bg-primary font-medium text-primary-foreground', className)}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
      'hover:bg-primary/5 data-[state=selected]:bg-primary/5',
      className
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef(({ className, children, ...props }, ref) => {
  const isActionsColumn = typeof children === 'string' && children.trim().toLowerCase() === 'actions';

  return (
    <th
      ref={ref}
      data-table-actions={isActionsColumn ? '' : undefined}
      className={cn(
        'h-12 px-4 text-left align-middle font-semibold text-muted-foreground [&:has([role=checkbox])]:pr-0',
        'text-xs uppercase tracking-[0.06em]',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
});
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-5 px-2 text-sm font-medium text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
