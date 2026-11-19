import React, { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const SpaceHeaderContext = createContext(null);

// Mounted only by an authenticated space. Keep the live profile and its actions
// owned by that space while rendering them in the shared desktop header.
// `searchItems` (optionnel) alimente la recherche de la barre supérieure ;
// sans lui, la recherche reprend les entrées visibles du menu latéral.
export default function SpaceHeaderIdentity({ children, searchItems }) {
  const context = useContext(SpaceHeaderContext);
  const register = context?.register;
  const setSearchItems = context?.setSearchItems;
  useEffect(() => {
    if (!register) return;
    register(1);
    return () => register(-1);
  }, [register]);

  useEffect(() => {
    if (!setSearchItems || !searchItems) return;
    setSearchItems(searchItems);
    return () => setSearchItems(null);
  }, [searchItems, setSearchItems]);

  if (!context) return <div className="hidden md:block">{children}</div>;
  return context.target
    ? createPortal(<div className="space-header-identity">{children}</div>, context.target)
    : null;
}
