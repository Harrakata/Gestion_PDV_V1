import { REQUEST_STATUS, getPlanningRequestTypeLabel } from '@/lib/guichetiereSpace';
import {
  MAINTENANCE_REQUEST_STATUSES,
  getMaintenancePlanningRequestTypeLabel,
} from '@/lib/maintenancePlanningRequests';
import { DEMANDE_STATUSES } from '@/lib/paiementGainUtils';
import { normalizeBigIntIdentifier } from '@/lib/paiementGainService';
import { ticketOverdue } from '@/lib/tickets';
import { SYNC_STALE_HOURS } from '@/lib/syncHealth';
import { REMONTEE_DESTINATAIRE } from '@/lib/messaging';
import { resources } from '@/lib/resourceMode';
import { appLocale } from '@/i18n/language';
import { isForContext } from './messageAudience';

// ── Mise en forme ────────────────────────────────────────────────────────────
// Date ISO au format de la langue, ou null si vide.
const fmtDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(appLocale());
};
const lines = (...items) => items.filter(Boolean).join('\n');

const toMessages = (rows, prefix, shape, categorie = 'urgent') =>
  rows.map((row) => ({ id: `${typeof prefix === 'function' ? prefix(row) : prefix}-${row.id}`, created_at: row.created_at, categorie, ...shape(row) }));

const maintenanceBody = (row, { withAgence = true } = {}) => lines(
  withAgence && row.agence_nom ? `Agence : ${row.agence_nom}` : null,
  row.date_planification ? `Planning du ${fmtDate(row.date_planification)}` : null,
  row.date_souhaitee ? `Date souhaitée → ${fmtDate(row.date_souhaitee)}` : null,
  row.motif ? `« ${row.motif} »` : null,
);
const maintenanceFrom = (row, options) => ({
  titre: `${row.technicien_nom || row.technicien_matricule || 'Technicien'} — ${getMaintenancePlanningRequestTypeLabel(row.type_demande)}`,
  corps: maintenanceBody(row, options),
  envoye_par_nom: row.technicien_nom || row.technicien_matricule || null,
});
const pdvBody = (row) => lines(
  row.requested_region ? `Région → ${row.requested_region}` : null,
  row.requested_agence_nom ? `Agence → ${row.requested_agence_nom}` : null,
  row.requested_terminal_reference ? `Terminal → ${row.requested_terminal_reference}` : null,
  row.commentaire ? `« ${row.commentaire} »` : null,
);

// Une alerte, ou rien si le compte est nul.
const alert = (count, notification) => (count > 0 ? [{ count, ...notification }] : []);
const alertList = (messages, notification) => alert(messages.length, { ...notification, messages });

// Le changement concerne-t-il cet utilisateur ? (colonne inconnue = oui)
const sameAs = (column, contextKey) => (row, ctx) => row[column] === undefined || String(row[column]) === String(ctx[contextKey]);
const addressedTo = (destinataires) => (row) => row.destinataires === undefined || destinataires.includes(row.destinataires);

// ── Messages de l'exploitation ───────────────────────────────────────────────
// « tous » = guichetières et techniciens
const audiences = (destinataire) => (['guichetiere', 'technicien'].includes(destinataire) ? [destinataire, 'tous'] : [destinataire]);

const loadMessages = async (repository, destinataire, ctx) => {
  const relevant = (await repository.fetchMessages()).filter(addressedTo(audiences(destinataire)));
  // Région et secteur de l'agence : lus seulement si un message s'en sert.
  const needsGeo = ['guichetiere', 'chef_agence'].includes(destinataire) && (!ctx.regionNom || !ctx.secteurNom)
    && relevant.some((message) => message.region_nom || message.secteur_nom);
  const geo = needsGeo ? await repository.fetchGeo(ctx.agenceNom) : {};
  const scope = { ...ctx, regionNom: ctx.regionNom || geo.region, secteurNom: ctx.secteurNom || geo.secteur };
  return relevant.filter((message) => isForContext(message, destinataire, scope));
};

const messagesSource = (destinataire) => ({
  key: 'messages',
  tables: ['messages_exploitation'],
  concerns: addressedTo(audiences(destinataire)),
  load: async (repository, ctx) => alertList(await loadMessages(repository, destinataire, ctx), {
    key: 'msg-expl', title: "Message(s) de l'exploitation", description: 'Cliquez pour lire', to: null, severity: 'blue',
  }),
});

const paymentsSource = (filters, notification) => ({
  key: 'pay',
  tables: ['demandes_paiement_gain'],
  load: async (repository, ctx) => alert(await repository.countRows('demandes_paiement_gain', filters(ctx)), { key: 'pay', severity: 'blue', ...notification }),
});

const ticketsSource = (filters, notification) => ({
  key: 'tickets',
  tables: ['tickets_incidents'],
  load: async (repository, ctx) => alert(await repository.countActiveTickets(filters(ctx)), { key: 'tickets', severity: 'amber', ...notification }),
});

const refusedSource = (table, column, contextKey, notification) => ({
  key: 'geo-refused',
  afterSync: true, // le refus est constaté à l'envoi des écritures hors-ligne
  load: async (repository, ctx) => alert(await repository.countRefused(table, column, ctx[contextKey]), { key: 'geo-refused', severity: 'red', ...notification }),
});

// Appareils bloqués : le seuil se compte en heures, inutile d'interroger plus souvent. La table
// n'est pas écoutée en temps réel : chaque appareil y écrit régulièrement.
const SYNC_CHECK_INTERVAL = resources.blockedDevices;
const isBlocked = (row) => row.oldest_pending_at && Date.now() - new Date(row.oldest_pending_at).getTime() > SYNC_STALE_HOURS * 3600 * 1000;

/** Sources de la cloche, par espace, dans l'ordre d'affichage. */
export const SPACE_SOURCES = {
  'espace-exploitation': [
    {
      key: 'pdv',
      tables: ['points_vente_mobi_change_requests'],
      load: async (repository) => alertList(toMessages(
        await repository.fetchDemandes('points_vente_mobi_change_requests', [['statut', REQUEST_STATUS.PENDING]]),
        'pdv',
        (row) => ({
          titre: `${row.code_point_vente || 'PDV'} — ${row.guichetiere_nom || row.guichetiere_matricule || ''}`.trim(),
          corps: pdvBody(row) || 'Demande de modification',
          envoye_par_nom: row.guichetiere_nom || row.guichetiere_matricule || null,
        }),
      ), { key: 'pdv', title: 'Demandes de modification PDV', description: 'En attente de validation', to: '/espace-exploitation/points-vente-mobi', severity: 'amber' }),
    },
    {
      key: 'maint',
      tables: ['planning_maintenance_modification_requests'],
      load: async (repository) => alertList(toMessages(
        await repository.fetchDemandes('planning_maintenance_modification_requests', [['statut', MAINTENANCE_REQUEST_STATUSES.PENDING_EXPLOITATION]]),
        'maint',
        (row) => maintenanceFrom(row),
      ), { key: 'maint', title: 'Demandes de maintenance', description: 'En attente exploitation', to: '/espace-exploitation/maintenance-terminaux', severity: 'amber' }),
    },
    paymentsSource(
      () => [['statutGlobal', DEMANDE_STATUSES.PENDING_EXPLOITATION]],
      { title: 'Paiements de gain à autoriser', description: 'En attente exploitation', to: '/espace-exploitation/autorisation-paiement-gain' },
    ),
    {
      key: 'tickets',
      tables: ['tickets_incidents'],
      load: async (repository) => {
        const { open, overdue } = await repository.fetchTicketSummary(ticketOverdue);
        return [
          ...alert(open, { key: 'tickets', title: 'Tickets à traiter', description: 'Incidents ouverts à assigner', to: '/espace-exploitation/tickets', severity: 'amber' }),
          ...alert(overdue, { key: 'tickets-sla', title: 'Tickets en retard (SLA)', description: 'Délai de résolution dépassé', to: '/espace-exploitation/tickets', severity: 'red' }),
        ];
      },
    },
    {
      key: 'sync-blocked',
      minInterval: SYNC_CHECK_INTERVAL,
      load: async (repository) => alert((await repository.fetchPendingDevices()).filter(isBlocked).length, {
        key: 'sync-blocked', title: 'Synchro bloquée', description: 'Appareils avec écritures en attente', to: '/espace-exploitation/activites-et-audit?tab=sante-synchro', severity: 'red',
      }),
    },
    {
      key: 'remontees',
      tables: ['messages_exploitation'],
      concerns: addressedTo([REMONTEE_DESTINATAIRE]),
      load: async (repository) => alert(await repository.countRemontees(REMONTEE_DESTINATAIRE), {
        key: 'remontees', title: 'Remontées terrain', description: 'Messages des agents à traiter', to: '/espace-exploitation/notifications-exploitation', severity: 'blue',
      }),
    },
  ],

  'espace-chef-agence': [
    {
      key: 'maint',
      tables: ['planning_maintenance_modification_requests'],
      concerns: sameAs('agence_nom', 'agenceNom'),
      load: async (repository, ctx) => alertList(toMessages(
        await repository.fetchDemandes('planning_maintenance_modification_requests', [['statut', MAINTENANCE_REQUEST_STATUSES.PENDING_CHEF], ['agence_nom', ctx.agenceNom]]),
        'maint',
        (row) => maintenanceFrom(row, { withAgence: false }),
      ), { key: 'maint', title: 'Demandes de maintenance', description: 'À valider pour votre agence', to: '/espace-chef-agence/maintenance-terminaux', severity: 'amber' }),
    },
    {
      key: 'planning',
      tables: ['planning_modification_requests'],
      concerns: sameAs('agence_nom', 'agenceNom'),
      load: async (repository, ctx) => alertList(toMessages(
        await repository.fetchDemandes('planning_modification_requests', [['statut', REQUEST_STATUS.PENDING], ['agence_nom', ctx.agenceNom]]),
        'plang',
        (row) => ({
          titre: `${row.guichetiere_nom || row.guichetiere_matricule || 'Guichetière'} — ${getPlanningRequestTypeLabel(row.type_demande)}`,
          corps: lines(
            row.date_planning ? `Planning du ${fmtDate(row.date_planning)}` : null,
            row.date_souhaitee ? `Date souhaitée → ${fmtDate(row.date_souhaitee)}` : null,
            row.motif ? `« ${row.motif} »` : null,
          ),
          envoye_par_nom: row.guichetiere_nom || row.guichetiere_matricule || null,
        }),
      ), { key: 'planning', title: 'Demandes de planning', description: 'À valider pour votre agence', to: '/espace-chef-agence/mon-planning', severity: 'amber' }),
    },
    paymentsSource(
      (ctx) => [['statutGlobal', DEMANDE_STATUSES.PENDING_CHEF], ['chefAgenceId', normalizeBigIntIdentifier(ctx.chefId)]],
      { title: 'Paiements de gain à valider', description: 'En attente de votre validation', to: '/espace-chef-agence/paiement-gros-gain' },
    ),
    messagesSource('chef_agence'),
    ticketsSource(
      (ctx) => [['agence_nom', ctx.agenceNom]],
      { title: 'Tickets / Incidents actifs', description: 'Incidents en cours sur votre agence', to: '/espace-chef-agence/tickets' },
    ),
  ],

  'espace-chef-secteur': [messagesSource('chef_secteur')],

  'espace-directeur-regional': [
    paymentsSource(
      (ctx) => [['statutGlobal', DEMANDE_STATUSES.PENDING_REGIONAL], ['directeurRegionalId', normalizeBigIntIdentifier(ctx.validatorId)]],
      { title: 'Paiements de gain à valider', description: 'En attente directeur régional', to: '/espace-validation-paiement-gain' },
    ),
    messagesSource('directeur_regional'),
  ],

  'espace-directeur-general': [
    paymentsSource(
      () => [['statutGlobal', DEMANDE_STATUSES.PENDING_GENERAL]],
      { title: 'Paiements de gain à valider', description: 'En attente directeur général', to: '/espace-directeur-general' },
    ),
  ],

  'espace-guichetiere': [
    {
      key: 'pdv',
      tables: ['points_vente_mobi_change_requests'],
      concerns: sameAs('guichetiere_matricule', 'matricule'),
      load: async (repository, ctx) => alertList(toMessages(
        await repository.fetchDemandes('points_vente_mobi_change_requests', [['guichetiere_matricule', ctx.matricule], ['statut', REQUEST_STATUS.PENDING]]),
        'pdv',
        (row) => ({
          titre: `${row.code_point_vente || 'PDV'} — En attente`,
          corps: pdvBody(row) || 'Demande de modification envoyée',
          envoye_par_nom: null,
        }),
        'info',
      ), { key: 'pdv', title: 'Votre demande de point de vente', description: 'En attente de traitement', to: '/espace-guichetiere/mes-points-vente-mobi', ctaLabel: 'Voir le suivi', severity: 'amber' }),
    },
    refusedSource('pointages', 'guichetiereMatricule', 'matricule', {
      title: 'Pointage(s) refusé(s)', description: 'Hors zone agence — annulé(s)', to: '/espace-guichetiere/mes-pointages',
    }),
    messagesSource('guichetiere'),
  ],

  'espace-technicien': [
    {
      key: 'demande',
      tables: ['planning_maintenance_modification_requests'],
      concerns: sameAs('technicien_id', 'technicienId'),
      load: async (repository, ctx) => alertList(toMessages(
        await repository.fetchDemandes('planning_maintenance_modification_requests', [
          ['technicien_id', ctx.technicienId],
          ['statut', [MAINTENANCE_REQUEST_STATUSES.PENDING_CHEF, MAINTENANCE_REQUEST_STATUSES.PENDING_EXPLOITATION]],
        ]),
        (row) => (row.statut === MAINTENANCE_REQUEST_STATUSES.PENDING_CHEF ? 'maintc' : 'mainte'),
        (row) => ({
          titre: `${getMaintenancePlanningRequestTypeLabel(row.type_demande)} — ${row.statut}`,
          corps: maintenanceBody(row),
          envoye_par_nom: null,
        }),
        'info',
      ), { key: 'demande', title: 'Vos demandes de planning', description: 'En cours de traitement', to: '/espace-technicien', ctaLabel: 'Voir le suivi', severity: 'amber' }),
    },
    refusedSource('interventions_maintenance', 'technicien_id', 'technicienId', {
      title: 'Intervention(s) refusée(s)', description: 'Hors zone agence — annulée(s)', to: '/espace-technicien',
    }),
    messagesSource('technicien'),
    ticketsSource(
      (ctx) => [['assigne_a_id', ctx.technicienId != null ? String(ctx.technicienId) : '']],
      { title: 'Tickets assignés', description: 'Incidents à prendre en charge', to: '/espace-technicien' },
    ),
  ],
};

/** Tables à écouter en temps réel pour un espace. */
export const tablesOfSpace = (spaceKey) => [...new Set((SPACE_SOURCES[spaceKey] || []).flatMap((source) => source.tables || []))];
