import React, { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const SpaceHeaderContext = createContext(null);

// Mounted only by an authenticated space. Keep the live profile and its actions
// owned by that space while rendering them in the shared desktop header.
export default function SpaceHeaderIdentity({ children }) {
  const context = useContext(SpaceHeaderContext);
  const register = context?.register;
  useEffect(() => {
    if (!register) return;
    register(1);
    return () => register(-1);
  }, [register]);

  if (!context) return <div className="hidden md:block">{children}</div>;
  return context.target
    ? createPortal(<div className="space-header-identity">{children}</div>, context.target)
    : null;
}
