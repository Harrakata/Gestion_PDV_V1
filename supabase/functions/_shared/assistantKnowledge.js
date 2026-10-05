export const normalizeAssistantText = (value) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Documentation métier commune au guide hors ligne et au contexte de l'agent.
export const ASSISTANT_GUIDES = [
  {
    id: 'navigation', title: 'Menus et espaces', keywords: 'menu onglet espace navigation trouver ouvrir utiliser application aide',
    tabs: [],
    text: "Le menu Espaces donne accès aux espaces Exploitation, Chef d'agence, Chef de secteur, Guichetière, Technicien et Direction. Chaque espace possède sa propre connexion. Les onglets proposés dépendent du profil connecté et des fonctionnalités activées. Un menu absent peut être désactivé ou non autorisé : demandez une vérification à un administrateur.",
  },
  {
    id: 'droits', title: 'Droits et lecture seule', keywords: 'droit permission profil lecture seule ecriture autorisation desactive acces bouton absent',
    tabs: ['profils-exploitation'],
    text: "Les accès sont définis par espace, onglet et sous-onglet. Aucun accès masque ou bloque la fonction ; Lecture permet de consulter ; Écriture permet les opérations proposées par la page. Les fonctionnalités globales peuvent aussi désactiver un espace ou un menu. Dans Profil et Fonctionnalité, vérifier le statut du profil, les permissions et les onglets activés. L'assistant ne modifie jamais ces droits.",
  },
  {
    id: 'agences', title: 'Agences et rattachements', keywords: 'agence region secteur code pdv adresse rattachement nom referentiel',
    tabs: ['agences', 'mes-guichetieres'],
    text: "La fiche Agence contient le nom, le code PDV, l'adresse, la région, le secteur et le nombre de terminaux déclaré. Le nombre déclaré ne prouve pas que tous les terminaux sont enregistrés ou disponibles. Une fiche courante du référentiel ne signifie pas que l'agence est ouverte en temps réel. Pour son état opérationnel, consulter les statuts des terminaux et leur suivi maintenance. Les filtres région, secteur et agence permettent de préciser le périmètre.",
  },
  {
    id: 'terminaux', title: 'États des terminaux', keywords: 'terminal terminaux etat statut actif inactif panne hors service maintenance parc reference',
    tabs: ['maintenance-terminaux', 'maintenance', 'terminaux-mobi'],
    text: "Le statut enregistré d'un terminal décrit sa situation dans le référentiel : par exemple Actif, Inactif, En maintenance ou Hors service, selon le parc concerné. Le suivi préventif est distinct du statut matériel : un terminal actif peut nécessiter un entretien. Les terminaux Mobi ont leur propre référentiel ; ne pas confondre un terminal Mobi avec un terminal du parc maintenance. Un statut enregistré n'est pas une mesure de disponibilité en direct.",
  },
  {
    id: 'maintenance', title: 'Maintenance préventive et curative', keywords: 'maintenance preventive curative suivi a jour retard intervention sous ensemble 30 jours',
    tabs: ['maintenance-terminaux', 'maintenance'],
    text: "La maintenance préventive vise l'entretien ; la curative traite un incident. Le suivi existant vérifie la date de la dernière intervention non annulée pour chaque sous-ensemble suivi : au-delà de 30 jours, en l'absence d'intervention ou de date exploitable, il demande une préventive. Tous les sous-ensembles suivis doivent être à jour pour que le terminal soit à jour. Ce suivi par date ne prouve pas à lui seul qu'une réparation est terminée. Les interventions ont leur propre statut : En cours, Terminée ou Annulée.",
  },
  {
    id: 'prediction', title: 'Risque agence et maintenance prédictive', keywords: 'prediction predictive risque score indice critique priorite centre actions',
    tabs: ['centre-operationnel'],
    text: "Le Centre d'actions opérationnel rassemble l'assistant salaire/caisse, les imports et notifications, les actions et risques, la maintenance et la cartographie. Le score agence classe les signaux à traiter. L'indice de maintenance combine notamment le suivi préventif, les interventions curatives récentes, les tickets et le statut terminal. C'est un indicateur de priorisation, pas une probabilité certifiée ni une panne garantie. Vérifier les signaux et le dernier suivi avant de planifier une intervention.",
  },
  {
    id: 'salaire', title: 'Rapprochement salaire/caisse', keywords: 'salaire caisse versement rapprochement ecart manque surplus prepose montant verse',
    tabs: ['centre-operationnel', 'chiffres-daffaires', 'etat-caisse'],
    text: "Dans Assistant salaire/caisse, choisir le mois puis rechercher un nom, un code préposé, une agence, une région ou un secteur. Les filtres avancés combinent géographie, identification, sources et montants. À verser = montant enregistré - annulations + avances - retraits. Écart = versé - à verser : négatif signifie manque, positif signifie surplus. Ce solde de caisse n'est pas le salaire net. Les totaux suivent les filtres. Déplier une ligne pour le calcul ou ouvrir le préposé pour son détail. Un préposé non identifié n'a pas de correspondance nominative exploitable dans le référentiel.",
  },
  {
    id: 'csv', title: 'Import et export CSV', keywords: 'csv import exporter fichier colonnes entetes erreur point virgule separateur',
    tabs: ['agences', 'guichetieres', 'techniciens', 'terminaux-mobi', 'secteurs'],
    text: "Dans les pages de référentiel, Exporter (CSV) permet de récupérer les colonnes attendues. Avant un import, conserver leurs noms exacts et vérifier les champs obligatoires. Le lecteur mutualisé reconnaît notamment la virgule, le point-virgule et la tabulation. Un message Colonnes manquantes indique une différence d'en-têtes ou de format. Vérifier aussi les codes et les rattachements. L'import exige un droit d'écriture. Les imports journalisés se consultent dans Activités et Audit.",
    steps: ["Exporter un fichier depuis le référentiel concerné et conserver une copie de sauvegarde.", "Préparer les lignes avec les en-têtes exacts ; conserver les codes comme du texte pour préserver les zéros initiaux.", "Choisir Importer (CSV) dans le même référentiel et sélectionner le fichier.", "Lire le résultat et les erreurs avant de recommencer ; contrôler les lignes déjà importées.", "Vérifier les fiches obtenues et, si disponible, le journal d'audit."],
  },
  {
    id: 'offline', title: 'Mode hors ligne et synchronisation', keywords: 'offline hors ligne synchronisation synchro attente reseau erreur',
    tabs: ['activites-et-audit'],
    text: "L'indicateur de synchronisation affiche les opérations en attente, les erreurs et la reprise de synchronisation. Seules les opérations prises en charge par le mode hors ligne peuvent être mises en file. Une saisie en attente n'est pas encore confirmée par le serveur. Reconnecter l'appareil puis vérifier l'indicateur ; les erreurs détaillées se consultent dans Activités et Audit, Santé synchro. Les consultations de données par l'IA nécessitent une connexion ; le guide intégré reste disponible.",
  },
  {
    id: 'tickets', title: 'Tickets et incidents', keywords: 'ticket incident signaler probleme priorite sla delai alerte',
    tabs: ['tickets'],
    text: "Dans Tickets / Incidents, renseigner le problème, l'agence ou le terminal concerné et la priorité, puis suivre le statut. Le Centre d'actions met en avant certains tickets actifs dépassant le délai cible et les incidents prioritaires. Consulter le ticket pour connaître les éléments et le délai applicables. L'assistant peut orienter vers le menu ; il ne crée ni ne clôture un ticket.",
  },
  {
    id: 'planning', title: 'Planning et pointage', keywords: 'planning presence pointage gps geolocalisation absence conge horaires',
    tabs: ['mon-planning', 'planning', 'etat-planning-general', 'suivi-pointage', 'mes-pointages', 'pointages'],
    text: "Le planning indique les affectations prévues ; le pointage enregistre la présence. Ces deux informations ne sont pas équivalentes. Pour pointer, autoriser la géolocalisation et vérifier le site ou l'agence concernée. Un pointage refusé ou non vérifié doit être contrôlé dans le suivi GPS. Les demandes d'absence possèdent un circuit de validation distinct : une demande ne vaut pas automatiquement une absence approuvée.",
  },
  {
    id: 'paiement', title: 'Circuit des paiements de gain', keywords: 'paiement gain validation autorisation directeur chef demande paye',
    tabs: ['autorisation-paiement-gain', 'paiement-gros-gain', 'paiement', 'paiements'],
    text: "Une demande de paiement suit le circuit de validation configuré pour le client. L'étape courante et le statut de la demande déterminent l'action attendue. Une autorisation de paiement ne signifie pas que le paiement final a été effectué : celui-ci doit être confirmé par l'acteur habilité. Vérifier le détail et l'historique de la demande. L'assistant ne valide, ne refuse et ne confirme aucun paiement.",
  },
  {
    id: 'connexion', title: 'Se connecter et retrouver son accès', keywords: 'connexion connecter session identifiant email mot passe oublie compte bloque', tabs: [],
    text: "Chaque espace possède sa connexion. Une fiche métier et un compte d'accès sont distincts ; une fiche existante ne garantit pas un accès actif. Ne communiquez jamais votre mot de passe dans l'assistant.",
    steps: ["Ouvrir l'espace correspondant à votre fonction.", "Utiliser les identifiants de ce compte, puis vérifier le message affiché en cas de refus.", "Si un lien de réinitialisation vous a été envoyé par e-mail, l'ouvrir et choisir un nouveau mot de passe.", "Si le compte reste bloqué, demander à l'administrateur de contrôler son statut et son association à la fiche métier."],
  },
  {
    id: 'creer-agence', title: 'Créer ou modifier une agence', keywords: 'creer ajouter nouvelle modifier agence fiche enregistrer', tabs: ['agences'],
    text: "La création et la modification demandent un droit d'écriture sur Agences. Modifier le nombre déclaré de terminaux ne crée pas de terminal dans le parc.",
    steps: ["Dans Agences, rechercher d'abord le nom ou le code PDV pour éviter un doublon.", "Choisir Ajouter une Agence ou le crayon de la fiche existante.", "Renseigner le nom, le code PDV, l'adresse, la région et, s'il est activé, le secteur. Vérifier le nombre de terminaux et l'attributeur.", "Vérifier les coordonnées GPS si elles sont renseignées ; Utiliser ma position doit être employé depuis l'agence.", "Valider avec Ajouter ou Sauvegarder, puis vérifier la fiche dans la liste."],
  },
  {
    id: 'regions', title: 'Vérifier une région ou un secteur', keywords: 'region secteur ancien nom obsolete renommer referentiel rattachement', tabs: ['regions', 'secteurs', 'agences'],
    text: "Les régions et secteurs proviennent du référentiel. Un ancien libellé dans un rapport peut aussi correspondre à une affectation historique ; ne remplacez pas les données passées sans vérifier la période.",
    steps: ["Contrôler le nom courant dans Régions puis le rattachement du secteur, si le niveau secteur est activé.", "Ouvrir la fiche de l'agence et vérifier la région et le secteur sélectionnés.", "Comparer le mois du rapport et l'historique de la fiche.", "Actualiser la vue et réexaminer les filtres. Si l'écart persiste, transmettre le code PDV, la période et le libellé concerné à l'administrateur."],
  },
  {
    id: 'guichetieres', title: 'Créer ou retrouver une guichetière', keywords: 'guichetiere creer ajouter retrouver nom prenom matricule prepose fiche', tabs: ['guichetieres', 'mes-guichetieres'],
    text: "La fiche nominative permet de relier une personne à son matricule, son code préposé et son agence. Vérifier les identifiants avant toute création pour éviter de dédoubler une personne.",
    steps: ["Dans Guichetières, rechercher la personne par nom ou identifiant.", "Avec un droit d'écriture, ouvrir Ajouter une Guichetière ou modifier la fiche trouvée.", "Vérifier le nom, le prénom, les identifiants, l'agence assignée et la disponibilité.", "Enregistrer puis vérifier le rattachement. Pour un changement d'agence daté, consulter l'historique des affectations."],
  },
  {
    id: 'affectation', title: 'Changer une affectation avec sa date', keywords: 'affectation muter mutation transfert changer agence guichetiere historique date effet', tabs: ['guichetieres'],
    text: "Une affectation doit être cohérente avec sa date d'effet. L'historique permet de distinguer la situation courante des périodes précédentes.",
    steps: ["Dans Guichetières, rechercher la personne puis ouvrir Historique des affectations.", "Dans Changer l'affectation, sélectionner Nouvelle agence.", "Renseigner la Date d'effet puis choisir Valider le changement.", "Contrôler l'entrée courante et les dates dans l'historique. Cette opération nécessite un droit d'écriture."],
  },
  {
    id: 'recherche', title: 'Retrouver des données avec les filtres', keywords: 'recherche rechercher filtrer filtres liste vide aucun resultat periode date mois tri', tabs: ['centre-operationnel', 'agences', 'chiffres-daffaires'],
    text: "Les filtres se cumulent : une bonne recherche peut ne rien afficher si la période ou un autre filtre exclut le résultat. Une liste vide ne prouve pas que la donnée n'existe pas.",
    steps: ["Vérifier l'espace, l'onglet et la période sélectionnés.", "Réinitialiser les filtres disponibles, puis rechercher un identifiant précis : code PDV, code préposé ou référence terminal.", "Ajouter progressivement la région, le secteur, l'agence ou le statut selon les contrôles de la page.", "Vérifier le compteur, le défilement ou la pagination de la liste.", "Si le résultat reste absent, faire vérifier le périmètre de vos droits et la présence des données sur cette période."],
  },
  {
    id: 'prepose-inconnu', title: 'Comprendre un préposé non identifié', keywords: 'prepose non identifie inconnu nom prenom manquant agence na correspondance', tabs: ['centre-operationnel', 'guichetieres', 'chiffres-daffaires'],
    text: "Préposé non identifié signifie qu'aucune correspondance nominative exploitable n'a été trouvée. Ce n'est pas une preuve d'absence de versement ou d'erreur de la personne.",
    steps: ["Noter le code préposé et la période affichés dans le rapprochement.", "Rechercher ce code dans le référentiel Guichetières et comparer le nom et le prénom.", "Vérifier l'agence et l'historique d'affectation à la date concernée.", "Faire corriger la fiche ou la source erronée par une personne habilitée, puis actualiser le rapprochement. Ne pas créer une personne uniquement pour faire disparaître le libellé."],
  },
  {
    id: 'objectifs', title: 'Consulter et répartir un objectif', keywords: 'objectif objectifs repartir repartition cible mensuel annuel performance', tabs: ['chiffres-daffaires'],
    text: "Un objectif est lié à un indicateur, une période et un périmètre. La cible, la valeur réalisée et l'atteinte sont des informations différentes.",
    steps: ["Dans la vue des salaires, choisir la période puis ouvrir Objectifs.", "Vérifier l'indicateur, les cibles et le périmètre de l'objectif concerné.", "Utiliser Répartir lorsqu'il est proposé et que vos droits permettent la modification.", "Contrôler les cibles de chaque entité et le total avant d'enregistrer.", "Revenir au récapitulatif pour comparer les cibles aux réalisations de la même période."],
  },
  {
    id: 'reparation', title: 'Suivre une réparation et ses pièces', keywords: 'reparation atelier piece rechange defectueux stock devis equipement', tabs: ['maintenance-terminaux', 'maintenance'],
    text: "Le suivi d'une intervention, le statut du terminal et les mouvements de pièces sont distincts. Une pièce en stock ne prouve pas qu'elle a été installée.",
    steps: ["Identifier la référence du terminal et le sous-ensemble concerné.", "Dans Maintenance Terminaux, consulter Réparation puis le sous-onglet disponible : Atelier, Stock Défectueux, Pièces détachées ou Devis pièces.", "Consulter la description, la procédure et les pièces associées au dossier.", "Après l'opération terrain, faire mettre à jour le dossier et le statut par la personne habilitée, puis vérifier le suivi maintenance."],
  },
  {
    id: 'cartographie', title: 'Lire la cartographie opérationnelle', keywords: 'carte cartographie localisation gps coordonnees position agence localisee', tabs: ['centre-operationnel', 'agences'],
    text: "La cartographie présente les agences et leur suivi opérationnel. Une localisation absente ou à préciser n'indique pas que l'agence est inactive.",
    steps: ["Ouvrir Centre d'actions opérationnel puis Cartographie.", "Rechercher l'agence par nom, code ou adresse ; ajuster les filtres de région et d'état.", "Consulter les informations de l'agence et les signaux de maintenance associés.", "Pour une position incorrecte, faire vérifier les coordonnées de la fiche Agence. Ne pas utiliser la position de votre appareil si vous n'êtes pas sur le site concerné."],
  },
  {
    id: 'notifications', title: 'Consulter les alertes et notifications', keywords: 'notification alerte escalade relance message rappel retard', tabs: ['notifications-exploitation', 'centre-operationnel'],
    text: "Les notifications attirent l'attention sur une information ou une action attendue. Lire une notification ne résout pas le dossier métier associé.",
    steps: ["Dans le Centre d'actions, consulter Imports & notifications et les alertes à relancer.", "Vérifier la référence, l'ancienneté et le statut du dossier avant de relancer.", "Ouvrir le dossier ou le menu de notifications autorisé pour examiner les détails.", "Après traitement, contrôler le statut du dossier source. Les envois et réglages de notifications demandent les droits correspondants."],
  },
  {
    id: 'audit', title: 'Retrouver une modification ou un import', keywords: 'audit journal historique trace auteur modification import erreur reprise', tabs: ['activites-et-audit'],
    text: "Le journal d'audit conserve les événements pris en charge par la journalisation. L'absence d'événement n'est pas une preuve qu'aucune modification n'a eu lieu.",
    steps: ["Ouvrir Activités et Audit avec un profil autorisé.", "Rechercher la période, l'entité ou l'opération concernée dans la vue disponible.", "Comparer le résultat et les détails avec la fiche ou le fichier d'origine.", "Avant de rejouer un import, vérifier les lignes déjà présentes pour éviter des doublons. En cas d'erreur de synchronisation, consulter Santé synchro."],
  },
  {
    id: 'mobi', title: 'Distinguer point de vente et terminal Mobi', keywords: 'mobi point vente vendeur terminal affectation appareil', tabs: ['points-vente-mobi', 'terminaux-mobi', 'mes-points-vente-mobi'],
    text: "Le point de vente décrit une implantation et ses rattachements ; le terminal Mobi décrit un appareil. Les deux référentiels ne sont pas interchangeables.",
    steps: ["Rechercher le point de vente par son code dans Point de Vente Mobi ou la vue de votre espace.", "Vérifier ses rattachements géographiques et la personne associée.", "Pour un problème d'appareil, consulter sa référence et son statut dans le référentiel des terminaux Mobi, si autorisé.", "Faire corriger le bon référentiel par une personne habilitée plutôt que créer un second point de vente."],
  },
  {
    id: 'lexique', title: 'Lexique des principaux termes', keywords: 'lexique vocabulaire definition signifie ccope pdv prepose sla mt enr reliquat', tabs: [],
    text: "PDV : point de vente ; le code PDV identifie l'agence ou le point concerné.\nPréposé : identifiant métier utilisé pour rapprocher les opérations d'une guichetière.\nMT ENR : montant enregistré, à distinguer du montant annulé.\nÀ verser : solde de caisse attendu, pas le salaire net.\nÉcart : montant versé moins montant à verser ; manque si négatif, surplus si positif.\nSLA : délai cible de traitement d'un ticket.\nPréventive : entretien destiné à prévenir les incidents.\nCurative : intervention pour traiter un incident.\nRéférentiel : fiches de référence des agences, personnes ou matériels.",
  },
];

export const ASSISTANT_GUIDE_CATEGORIES = [
  { id: 'demarrer', title: 'Premiers pas', guides: ['navigation', 'connexion', 'droits', 'recherche', 'lexique'] },
  { id: 'reseau', title: 'Agences et personnel', guides: ['agences', 'creer-agence', 'regions', 'guichetieres', 'affectation', 'mobi'] },
  { id: 'materiel', title: 'Terminaux et maintenance', guides: ['terminaux', 'maintenance', 'reparation', 'prediction', 'cartographie', 'tickets'] },
  { id: 'caisse', title: 'Caisse et objectifs', guides: ['salaire', 'prepose-inconnu', 'objectifs', 'paiement'] },
  { id: 'quotidien', title: 'Suivi quotidien', guides: ['planning', 'csv', 'offline', 'notifications', 'audit'] },
];

const STOP_WORDS = new Set('les des une pour dans avec quels quelles quel quelle comment est sont mon mes sur aux du de le la un et ou en je il que qui a au ce cet cette ces faire peux peut moi vous nous'.split(' '));
export function searchAssistantGuides(query, currentTab = '', limit = 3) {
  const words = normalizeAssistantText(query).split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return ASSISTANT_GUIDES.map((guide) => {
    const keywords = normalizeAssistantText(`${guide.title} ${guide.keywords}`);
    const score = words.reduce((sum, word) => sum + (keywords.includes(word) ? 3 : normalizeAssistantText(`${guide.text} ${(guide.steps || []).join(' ')}`).includes(word) ? 1 : 0), 0);
    return { ...guide, score: score + (score > 0 && guide.tabs.includes(currentTab) ? 2 : 0) };
  }).filter((guide) => guide.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function listAssistantGuides(query = '', category = 'all', currentTab = '') {
  const allowed = ASSISTANT_GUIDE_CATEGORIES.find((entry) => entry.id === category)?.guides || [];
  const guides = query.trim() ? searchAssistantGuides(query, currentTab, ASSISTANT_GUIDES.length)
    : [...ASSISTANT_GUIDES].sort((a, b) => Number(b.tabs.includes(currentTab)) - Number(a.tabs.includes(currentTab)));
  return guides.filter((guide) => category === 'all' || allowed.includes(guide.id));
}

export function formatAssistantGuide(guide) {
  return `${guide.title}\n${guide.text}${guide.steps?.length ? `\n\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : ''}`;
}

export function assistantGuideReply(id, menus = []) {
  const guide = ASSISTANT_GUIDES.find((entry) => entry.id === id);
  if (!guide) return { mode: 'guide', answer: 'Cette fiche est indisponible.', sources: [] };
  return { mode: 'guide', answer: formatAssistantGuide(guide), sources: [{ id: guide.id, title: guide.title,
    path: menus.find((menu) => guide.tabs.includes(menu.key))?.path || null }] };
}

export function assistantSuggestions(currentTab = '') {
  const contextual = ASSISTANT_GUIDES.filter((guide) => guide.tabs.includes(currentTab));
  const defaults = ['navigation', 'recherche', 'creer-agence', 'terminaux', 'salaire', 'csv'].map((id) => ASSISTANT_GUIDES.find((guide) => guide.id === id));
  return [...new Map([...contextual, ...defaults].map((guide) => [guide.id, guide])).values()].slice(0, 6);
}

export function guideReply(query, currentTab = '', menus = []) {
  if (/^(bonjour|salut|bonsoir|merci|aide|help)[ !?.]*$/.test(normalizeAssistantText(query))) {
    return { mode: 'guide', answer: "Bonjour ! Je peux vous aider à retrouver un menu, créer une agence, affecter une guichetière, comprendre un statut, préparer un import ou analyser un écart de caisse. Quel sujet souhaitez-vous aborder ?", sources: [] };
  }
  const guides = searchAssistantGuides(query, currentTab);
  return {
    mode: 'guide',
    answer: guides.length ? guides.map(formatAssistantGuide).join('\n\n')
      : "Je n'ai pas trouvé de rubrique précise. Vous pouvez préciser le menu concerné : agences, terminaux, maintenance, salaire/caisse, imports, pointage ou droits d'accès.",
    sources: guides.map((guide) => ({ id: guide.id, title: guide.title,
      path: menus.find((menu) => guide.tabs.includes(menu.key))?.path || null })),
  };
}
