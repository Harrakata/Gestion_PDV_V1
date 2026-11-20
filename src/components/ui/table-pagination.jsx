import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Pied de tableau paginé — format standard de l'application (cf. liste des
 * guichetières) : « 37 entrée(s) — Page 1 / 2 » à gauche, précédent / suivant à droite.
 * À utiliser avec usePagination() :
 *   <TablePagination {...pager} />
 */
export function TablePagination({ page, setPage, pageCount, total, label = 'entrée(s)', className }) {
  if (!total) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn('mt-1 flex items-center justify-between border-t border-border/40 pt-3', className)}
    >
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {total} {label} — Page {page + 1} / {pageCount}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="Page précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          aria-label="Page suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

export default TablePagination;
