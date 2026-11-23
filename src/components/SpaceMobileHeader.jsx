import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Search, X } from 'lucide-react';
import { SpaceHeaderContext } from '@/components/SpaceHeaderIdentity';
import SpaceHeaderSearch from '@/components/SpaceHeaderSearch';

/**
 * En-tête mobile/PWA commun à tous les espaces connectés — pendant de la barre
 * supérieure PC : carte blanche opaque, photo ronde + nom à gauche, puis
 * recherche, actions (cloche, remontée…) et bouton menu en pastilles rondes.
 * La recherche se déplie sous la carte et réutilise celle du PC.
 */
export default function SpaceMobileHeader({ photoUrl, initials, name, role, actions, menuId, menuOpen, onToggleMenu }) {
  const context = useContext(SpaceHeaderContext);
  const location = useLocation();
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <div className="app-space-mobile-header md:hidden">
      <div className="space-mobile-header-bar flex items-center gap-2.5">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-primary/20" />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
            aria-hidden="true"
          >
            {(initials || '?').slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-bold text-foreground">{name || '—'}</p>
          {role && <p className="truncate text-xs font-medium text-muted-foreground">{role}</p>}
        </div>
        <div className="space-header-actions flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label={searchOpen ? 'Fermer la recherche' : 'Rechercher'}
            aria-expanded={searchOpen}
            className="inline-flex items-center justify-center"
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
          {actions}
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            className="app-space-header-toggle inline-flex items-center justify-center"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="space-mobile-header-search">
          <SpaceHeaderSearch
            autoFocus
            items={context?.searchItems}
            enableDataSearch={location.pathname.startsWith('/espace-exploitation')}
            onDone={() => setSearchOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
