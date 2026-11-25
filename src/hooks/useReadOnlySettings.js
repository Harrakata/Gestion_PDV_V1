import { useOutletContext } from 'react-router-dom';

/** L'écran Paramètres est-il ouvert en lecture seule pour ce profil ? */
export const useReadOnlySettings = () => useOutletContext()?.canWriteCurrentPage === false;
