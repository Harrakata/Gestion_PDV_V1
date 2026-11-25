// À qui s'adresse un message de l'exploitation. Règle unique pour la cloche (notificationsModel)
// et pour les notifications push (Edge Function send-push) : les deux visent les mêmes personnes.
// Module sans dépendance (chargé aussi par Deno).

/** Rôles destinataires d'un message. « tous » = guichetières et techniciens. */
export const rolesOf = (destinataires) => (destinataires === 'tous' ? ['guichetiere', 'technicien'] : [destinataires]);

/** Le message est-il limité à certaines personnes, agences, secteurs ou régions ? */
export const isScoped = (message) => Boolean(
  message.agence_nom || message.secteur_nom || message.region_nom
  || message.guichetiere_matricules?.length || message.technicien_ids?.length,
);

/** Le message concerne-t-il cette personne ? ctx : { matricule, technicienId, agenceNom, secteurNom, regionNom } */
export const isForContext = (message, role, ctx) => {
  const { agence_nom: agence, secteur_nom: secteur, region_nom: region } = message;
  switch (role) {
    case 'guichetiere':
      if (message.guichetiere_matricules?.length > 0) return message.guichetiere_matricules.includes(ctx.matricule || '');
      break;
    case 'technicien':
      if (message.technicien_ids?.length > 0) return message.technicien_ids.map(String).includes(String(ctx.technicienId));
      return true;
    case 'chef_agence':
      break;
    case 'chef_secteur':
      if (secteur) return secteur === ctx.secteurNom;
      return region ? region === ctx.regionNom : true;
    case 'directeur_regional':
      return region ? region === ctx.regionNom : true;
    default:
      return false;
  }
  if (agence) return agence === ctx.agenceNom;
  if (secteur) return secteur === ctx.secteurNom;
  return region ? region === ctx.regionNom : true;
};
