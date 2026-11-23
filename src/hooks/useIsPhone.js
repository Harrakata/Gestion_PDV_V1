import { useSyncExternalStore } from 'react';

// Même seuil que les règles « Mobile / PWA » d'index.css.
const QUERY = '(max-width: 767px)';
const media = () => (typeof window === 'undefined' ? null : window.matchMedia?.(QUERY));

const subscribe = (listener) => {
  const list = media();
  list?.addEventListener?.('change', listener);
  return () => list?.removeEventListener?.('change', listener);
};

/** Vrai sur téléphone (largeur < 768 px). */
export const useIsPhone = () => useSyncExternalStore(subscribe, () => Boolean(media()?.matches), () => false);

export default useIsPhone;
