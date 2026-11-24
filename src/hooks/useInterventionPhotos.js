import { useEffect, useState } from 'react';
import { fetchInterventionPhotos } from '@/lib/photos';

// Lecture à part des grosses requêtes : les écrans restent fonctionnels tant que la
// migration des photos n'est pas appliquée chez un client.
/** Photos des interventions : `photos[String(id)]` → url[] (ou undefined). */
export const useInterventionPhotos = (refreshKey) => {
  const [photos, setPhotos] = useState({});
  useEffect(() => {
    let cancelled = false;
    fetchInterventionPhotos().then((map) => { if (!cancelled) setPhotos(map); }).catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);
  return photos;
};

export default useInterventionPhotos;
