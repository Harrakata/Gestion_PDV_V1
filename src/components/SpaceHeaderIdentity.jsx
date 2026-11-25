import { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const SpaceHeaderContext = createContext(null);

// Mounted only by an authenticated space. Keep the live profile and its actions
// owned by that space while rendering them in the shared desktop header.
// La recherche reçoit les destinations autorisées du menu de l'espace.
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
