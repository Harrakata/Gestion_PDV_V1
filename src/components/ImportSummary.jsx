import { hasPasswordColumn } from '@/lib/csv';

/** Résultat d'un import CSV ; prévient si le fichier contenait des mots de passe, jamais enregistrés. */
const ImportSummary = ({ message, headers }) => (
  <>
    {message}
    {hasPasswordColumn(headers) && (
      <span className="mt-1 block">Les mots de passe du fichier ne sont pas enregistrés : définissez-les depuis chaque fiche.</span>
    )}
  </>
);

export default ImportSummary;
