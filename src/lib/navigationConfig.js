const EXPLOITATION_PAGES = [
  ['tableau-de-bord', 'Tableau de bord', 'indicateurs statistiques'],
  ['centre-operationnel', "Centre d’actions", 'alertes opérations'],
  ['agences', 'Agences', 'points de vente'],
  ['chefs-agence', "Chefs d’agence", 'responsables'],
  ['guichetieres', 'Guichetières', 'personnel'],
  ['techniciens', 'Techniciens', 'maintenance'],
  ['maintenance-terminaux', 'Maintenance terminaux', 'interventions'],
  ['suivi-pointage', 'Suivi pointage', 'présence'],
  ['controle-presence', 'Contrôle présence GPS', 'écarts localisation'],
  ['terminaux-mobi', 'Terminaux Mobi', 'équipements'],
  ['points-vente-mobi', 'Points de vente Mobi', 'pdv rentabilité'],
  ['regions', 'Régions', 'structure'],
  ['secteurs', 'Secteurs', 'structure'],
  ['chefs-secteur', 'Chefs de secteur', 'responsables'],
  ['validation-paiement-gain', 'Directeurs régionaux', 'validation gains'],
  ['direction-generale', 'Direction générale', 'validation gains'],
  ['autorisation-paiement-gain', 'Autorisation paiement gain', 'paiement'],
  ['referentiel-parametres', 'Référentiel paramètres', 'configuration'],
  ['etat-planning-general', 'État planning général', 'planning'],
  ['activites-et-audit', 'Activités et audit', 'journal synchronisation'],
  ['chiffres-daffaires', 'État comptable', 'ccope chiffre affaires'],
  ['notifications-exploitation', 'Notifications', 'alertes'],
  ['rapports', 'Rapports', 'exports'],
  ['absences', "Demandes d’absence", 'congés'],
  ['tickets', 'Tickets et incidents', 'support'],
  ['performance', 'Performance', 'mesures'],
  ['parametres', 'Paramètres', 'configuration'],
  ['profils-exploitation', 'Profil et fonctionnalité', 'droits espaces utilisateurs'],
];

const CHEF_AGENCE_PAGES = [
  ['mon-planning', 'Mon planning', 'calendrier'],
  ['mes-guichetieres', 'Mes guichetières', 'équipe'],
  ['maintenance-terminaux', 'Maintenance terminaux', 'interventions'],
  ['suivi-pointage', 'Suivi pointage', 'présence'],
  ['points-vente-mobi', 'Points de vente Mobi', 'pdv'],
  ['paiement-gros-gain', 'Paiement gros gain', 'gain'],
  ['rapports', 'Rapports', 'exports'],
  ['absences', "Demandes d’absence", 'congés'],
  ['tickets', 'Tickets et incidents', 'support'],
];

const GUICHETIERE_PAGES = [
  ['mon-planning', 'Mon planning', 'calendrier'],
  ['mes-pointages', 'Mes pointages', 'présence'],
  ['mes-points-vente-mobi', 'Mes points de vente Mobi', 'pdv'],
  ['etat-caisse', 'État de caisse', 'comptabilité'],
  ['demandes-absence', "Demandes d’absence", 'congés'],
  ['tickets', 'Tickets', 'support incidents'],
];

export const ROUTE_LABELS = {
  '': 'Accueil',
  pointage: 'Pointage',
  'paiement-gros-gain': 'Paiement gros gain',
  'reset-password': 'Réinitialisation du mot de passe',
  'espace-exploitation': 'Espace Exploitation',
  'espace-chef-agence': "Espace Chef d’agence",
  'espace-chef-secteur': 'Espace Chef de secteur',
  'espace-guichetiere': 'Espace Guichetière',
  'espace-technicien': 'Espace Technicien',
  'espace-validation-paiement-gain': 'Espace Directeur régional',
  'espace-directeur-general': 'Espace Directeur général',
  ...Object.fromEntries(
    [...EXPLOITATION_PAGES, ...CHEF_AGENCE_PAGES, ...GUICHETIERE_PAGES]
      .map(([key, label]) => [key, label])
  ),
};

const CONTEXTUAL_SPACES = [
  { root: '/espace-exploitation', label: 'Pages de l’espace Exploitation', pages: EXPLOITATION_PAGES },
  { root: '/espace-chef-agence', label: "Pages de l’espace Chef d’agence", pages: CHEF_AGENCE_PAGES },
  { root: '/espace-guichetiere', label: 'Pages de l’espace Guichetière', pages: GUICHETIERE_PAGES },
];

export function getContextualNavigationGroup(pathname) {
  const space = CONTEXTUAL_SPACES.find(({ root }) => pathname.startsWith(root));
  if (!space) return null;
  return {
    label: space.label,
    items: space.pages.map(([path, label, keywords]) => ({
      to: `${space.root}/${path}`,
      label,
      keywords,
    })),
  };
}

export function buildBreadcrumbs(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs = [{ label: 'Accueil', to: '/' }];
  let currentPath = '';
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const fallback = segment
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    crumbs.push({
      label: ROUTE_LABELS[segment] || fallback,
      to: currentPath,
      current: index === segments.length - 1,
    });
  });
  return crumbs;
}

