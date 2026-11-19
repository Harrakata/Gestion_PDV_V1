import React from 'react';

/**
 * Identité affichée dans la barre supérieure d'un espace connecté (desktop) :
 * les icônes d'action à gauche, puis une pastille arrondie « photo + nom ».
 */
export default function SpaceHeaderProfile({ photoUrl, initials, name, actions }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {actions && <div className="space-header-actions flex shrink-0 items-center gap-2">{actions}</div>}
      <div className="space-header-profile flex min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-primary/20"
          />
        ) : (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
            aria-hidden="true"
          >
            {(initials || '?').slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="max-w-[14rem] truncate text-sm font-semibold text-foreground">{name || '—'}</span>
      </div>
    </div>
  );
}
