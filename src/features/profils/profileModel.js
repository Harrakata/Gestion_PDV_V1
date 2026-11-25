import {
  APP_SPACE_TAB_FUNCTIONALITIES,
  EXPLOITATION_ACCESS_LEVELS,
  buildDefaultAppSpaceProfilePermissions,
  flattenSpaceTabItems,
  normalizeAppSpaceProfilePermissions,
} from '../../lib/exploitationProfiles.js';

export const ALL_FILTER_VALUE = '__all__';
export const EXPLOITATION_SPACE_KEY = 'espace-exploitation';
export const EXPLOITATION_SPACE_TAB_ITEMS = flattenSpaceTabItems(
  APP_SPACE_TAB_FUNCTIONALITIES.find((space) => space.spaceKey === EXPLOITATION_SPACE_KEY)?.tabs || []
);

export const createDefaultFormData = () => ({
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  motDePasse: '',
  statut: 'Actif',
  photo_url: null,
  permissions: buildDefaultAppSpaceProfilePermissions(EXPLOITATION_SPACE_KEY, EXPLOITATION_ACCESS_LEVELS.NONE),
});

export const MANAGED_SPACE_TABLES = {
  'espace-exploitation': {
    table: 'profils_exploitation',
    label: 'Profil Exploitation',
    pluralLabel: 'Profils Exploitation',
    select: 'id, nom, prenom, email, telephone, statut, permissions, photo_url, auth_user_id, created_at',
    orderColumn: 'nom',
  },
  'espace-technicien': {
    table: 'techniciens',
    label: 'Technicien',
    pluralLabel: 'Techniciens',
    select: 'id, nom, prenom, email, telephone, matricule, auth_user_id',
    orderColumn: 'nom',
  },
  'espace-guichetiere': {
    table: 'guichetieres',
    label: 'Guichetière',
    pluralLabel: 'Guichetières',
    select: 'id, nom, prenom, email, telephone, matricule, codePrepose, agenceAssigne, auth_user_id, is_current',
    orderColumn: 'nom',
    currentFilter: { column: 'is_current', value: true },
  },
  'espace-chef-agence': {
    table: 'chefs_agence',
    label: "Chef d'agence",
    pluralLabel: "Chefs d'agence",
    select: 'id, nom, prenom, email, telephone, matricule, agenceEnCharge, auth_user_id, is_current',
    orderColumn: 'nom',
    currentFilter: { column: 'is_current', value: true },
  },
};

export const MANAGED_SPACE_CREATE_PATHS = {
  'espace-technicien': '/espace-exploitation/techniciens',
  'espace-guichetiere': '/espace-exploitation/guichetieres',
  'espace-chef-agence': '/espace-exploitation/chefs-agence',
};

export const createSpaceTemplateId = () => `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getManagedUserDisplayName = (user) =>
  [user?.prenom, user?.nom].filter(Boolean).join(' ').trim()
  || user?.email
  || user?.matricule
  || 'Utilisateur';

export const getManagedUserSubtitle = (spaceKey, user) => {
  if (spaceKey === 'espace-exploitation') return user?.telephone || 'Profil Exploitation';
  if (spaceKey === 'espace-chef-agence') return user?.agenceEnCharge || 'Agence non renseignée';
  if (spaceKey === 'espace-guichetiere') return user?.agenceAssigne || 'Agence non renseignée';
  return user?.matricule ? `Matricule ${user.matricule}` : 'Technicien de maintenance';
};

export const countSpaceAccessLevels = (spaceKey, permissions) => {
  const values = Object.values(normalizeAppSpaceProfilePermissions(
    spaceKey,
    permissions,
    EXPLOITATION_ACCESS_LEVELS.NONE
  ));

  return {
    writeCount: values.filter((value) => value === EXPLOITATION_ACCESS_LEVELS.WRITE).length,
    readCount: values.filter((value) => value === EXPLOITATION_ACCESS_LEVELS.READ).length,
    allowedCount: values.filter((value) => value !== EXPLOITATION_ACCESS_LEVELS.NONE).length,
  };
};

export const countAccessLevels = (permissions) => countSpaceAccessLevels(EXPLOITATION_SPACE_KEY, permissions);
export const getProfileStatusTone = (status) => status === 'Actif' ? 'success' : 'neutral';

export const getTabAndDescendantKeys = (items, tabKey) =>
  items
    .filter((item) => item.key === tabKey || item.key.startsWith(`${tabKey}.`))
    .map((item) => item.key);
