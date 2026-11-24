import { useCallback, useEffect, useRef, useState } from 'react';
import { releasePhoto } from '@/lib/photos';

/** Photos choisies et pas encore enregistrées : `[photos, setPhotos, clearPhotos]`. */
export const usePhotoSelection = () => {
  const [photos, setPhotos] = useState([]);
  const latest = useRef(photos);
  latest.current = photos;
  // Les aperçus sont libérés par l'écran propriétaire : le sélecteur, lui, peut être
  // démonté entre deux étapes d'un formulaire.
  useEffect(() => () => latest.current.forEach(releasePhoto), []);
  const clearPhotos = useCallback(() => {
    latest.current.forEach(releasePhoto);
    setPhotos([]);
  }, []);
  return [photos, setPhotos, clearPhotos];
};

export default usePhotoSelection;
