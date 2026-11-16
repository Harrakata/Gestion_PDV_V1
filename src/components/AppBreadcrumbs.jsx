import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildBreadcrumbs } from '@/lib/navigationConfig';

export default function AppBreadcrumbs({ pathname }) {
  const crumbs = buildBreadcrumbs(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Fil d’Ariane" className="mb-4 overflow-x-auto sm:mb-5">
      <ol className="flex min-w-max items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <React.Fragment key={crumb.to}>
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" /> : null}
            <li>
              {crumb.current ? (
                <span aria-current="page" className="font-medium text-foreground">{crumb.label}</span>
              ) : (
                <Link to={crumb.to} className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {index === 0 ? <Home className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {crumb.label}
                </Link>
              )}
            </li>
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

