import { useEffect, useMemo, useState } from 'react';

/**
 * Pagination côté client d'une liste déjà filtrée.
 *
 *   const pager = usePagination(filteredRows, { pageSize: 25, resetKey: filtersKey });
 *   pager.pageItems.map(...)            // lignes de la page courante
 *   <TablePagination {...pager} />      // contrôles
 *
 * @param {Array} items
 * @param {{ pageSize?: number, resetKey?: unknown }} options
 *        resetKey : toute valeur qui change quand les filtres changent → retour page 1.
 */
export function usePagination(items, { pageSize: initialPageSize = 25, resetKey } = {}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items?.length || 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Retour à la 1re page quand les filtres ou la taille de page changent.
  useEffect(() => { setPage(0); }, [resetKey, pageSize]);
  // La page courante reste valide si la liste raccourcit.
  useEffect(() => { if (page > pageCount - 1) setPage(pageCount - 1); }, [page, pageCount]);

  const pageItems = useMemo(
    () => (items || []).slice(page * pageSize, (page + 1) * pageSize),
    [items, page, pageSize]
  );

  return { page, setPage, pageSize, setPageSize, pageCount, total, pageItems };
}

export default usePagination;
