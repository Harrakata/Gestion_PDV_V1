import {
  APP_SPACE_TAB_FUNCTIONALITIES, getEffectiveAppSpaceUserProfile,
  normalizeExploitationPermissions, normalizeAppSpaceTabFunctionalities,
} from '../../../src/lib/exploitationProfiles.js';

export const ASSISTANT_SPACES = {
  'espace-exploitation': { table: 'profils_exploitation', columns: 'id, permissions, statut', active: ['statut', 'Actif'] },
  'espace-chef-agence': { table: 'chefs_agence', columns: 'id, agenceEnCharge, codePDV', active: ['is_current', true] },
  'espace-chef-secteur': { table: 'chefs_secteur', columns: 'id, secteurEnCharge' },
  'espace-guichetiere': { table: 'guichetieres', columns: 'id, agenceAssigne', active: ['is_current', true] },
  'espace-technicien': { table: 'techniciens', columns: 'id' },
  'espace-directeur-regional': { table: 'validateurs_paiement_gain', columns: 'id, regionAssignee, fonction, statut', active: ['statut', 'Actif'], fonction: 'Directeur régional' },
  'espace-directeur-general': { table: 'validateurs_paiement_gain', columns: 'id, fonction, statut', active: ['statut', 'Actif'], fonction: 'Directeur général' },
};

export function assistantSpaceFromPath(pathname) {
  const root = String(pathname || '').split('/')[1];
  if (root === 'espace-validation-paiement-gain') return 'espace-directeur-regional';
  return Object.hasOwn(ASSISTANT_SPACES, root) ? root : null;
}

const FEATURES = {
  'maintenance-terminaux': 'maintenance-terminaux', maintenance: 'maintenance-terminaux',
  'chiffres-daffaires': 'ccope', 'points-vente-mobi': 'point-de-vente-mobi',
  'mes-points-vente-mobi': 'point-de-vente-mobi', 'suivi-pointage': 'pointage',
  'mes-pointages': 'pointage', pointages: 'pointage', 'controle-presence': 'pointage',
  'etat-planning-general': 'planning_general', 'activites-et-audit': 'audit',
  'notifications-exploitation': 'notifications', tickets: 'tickets-incidents',
  absences: 'demandes-absence', 'demandes-absence': 'demandes-absence',
  'autorisation-paiement-gain': 'paiement-gros-gain', paiement: 'paiement-gros-gain', paiements: 'paiement-gros-gain',
};

export function resolveAssistantAccess(space, profile, settings = {}) {
  if (!ASSISTANT_SPACES[space] || !profile?.id) throw new Error('Aucun profil actif associé à cet espace.');
  const flags = settings.functionalites_espaces || {};
  if (flags[space] === false) throw new Error('Cet espace est désactivé.');
  const sectorEnabled = settings.org_structure?.secteur?.enabled !== false;
  if (!sectorEnabled && space === 'espace-chef-secteur') throw new Error('Le niveau secteur est désactivé.');
  const effective = getEffectiveAppSpaceUserProfile(settings.profils_espaces_utilisateurs, space, profile.id);
  if (effective.statut !== 'Actif' || profile.statut === 'Inactif') throw new Error('Ce profil est désactivé.');
  const permissions = space === 'espace-exploitation' ? normalizeExploitationPermissions(profile.permissions) : effective.permissions;
  const tabs = normalizeAppSpaceTabFunctionalities(settings.functionalites_espaces_onglets)[space] || {};
  const allowed = (key) => {
    const parts = key.split('.');
    const root = parts[0];
    if (!sectorEnabled && ['secteurs', 'chefs-secteur'].includes(root)) return false;
    if (FEATURES[root] && flags[FEATURES[root]] === false) return false;
    return parts.every((_, i) => {
      const ancestor = parts.slice(0, i + 1).join('.');
      const level = space === 'espace-exploitation'
        ? (i === 0 ? permissions[ancestor] : profile.permissions?.[ancestor] ?? permissions[root])
        : permissions[ancestor];
      // Direction spaces use the shared feature switches, without per-user tab overrides.
      return tabs[ancestor] !== false && (space.startsWith('espace-directeur-') || ['read', 'write'].includes(level));
    });
  };
  const base = space === 'espace-directeur-regional' ? '/espace-validation-paiement-gain' : `/${space}`;
  const nestedRoutes = ['espace-exploitation', 'espace-chef-agence', 'espace-guichetiere'].includes(space);
  const menus = (APP_SPACE_TAB_FUNCTIONALITIES.find((entry) => entry.spaceKey === space)?.tabs || [])
    .filter((tab) => allowed(tab.key)).map((tab) => ({ key: tab.key, title: tab.label, path: nestedRoutes ? `${base}/${tab.key}` : base }));
  const maintenanceTab = space === 'espace-exploitation' || space === 'espace-chef-agence' ? 'maintenance-terminaux.suivi' : 'maintenance';
  const canReadTerminals = menus.some((menu) => ['maintenance-terminaux', 'maintenance'].includes(menu.key)) && allowed(maintenanceTab);
  const canReadAgencies = canReadTerminals || menus.some((menu) => menu.key === 'agences');
  const canReadMobi = space === 'espace-exploitation' && allowed('terminaux-mobi');
  let scope = { kind: 'all', value: null };
  if (space === 'espace-chef-agence') scope = profile.codePDV
    ? { kind: 'codePDV', value: String(profile.codePDV).trim() }
    : { kind: 'nom', value: profile.agenceEnCharge || null };
  if (space === 'espace-chef-secteur') scope = { kind: 'secteur', value: profile.secteurEnCharge || null };
  if (space === 'espace-directeur-regional') scope = { kind: 'region', value: profile.regionAssignee || null };
  if (space === 'espace-guichetiere') scope = { kind: 'nom', value: profile.agenceAssigne || null };
  return { space, menus, scope, canReadAgencies, canReadTerminals, canReadMobi };
}

export function validateAssistantMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 12) throw new Error('Conversation invalide.');
  const result = messages.map((message) => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 4000) {
      throw new Error('Message invalide (4 000 caractères maximum).');
    }
    return { role: message.role, content: message.content.trim() };
  });
  if (result.at(-1).role !== 'user') throw new Error('Une question est attendue.');
  return result;
}

export function validateLookup(input) {
  if (!input || !['agences', 'terminaux', 'terminaux_mobi'].includes(input.entity)) throw new Error('Source non autorisée.');
  if (typeof input.query !== 'string' || input.query.length > 100 || typeof input.status !== 'string' || input.status.length > 60) throw new Error('Recherche invalide.');
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) throw new Error('Limite invalide.');
  return input;
}
