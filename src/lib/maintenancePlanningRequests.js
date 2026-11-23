import { isMissingSupabaseTableError } from '@/lib/guichetiereSpace';

export const MAINTENANCE_REQUEST_STATUSES = {
  PENDING_CHEF: "En attente chef d'agence",
  PENDING_EXPLOITATION: 'En attente exploitation',
  APPROVED: 'Approuvée',
  REFUSED_CHEF: "Refusée par le chef d'agence",
  REFUSED_EXPLOITATION: "Refusée par l'exploitation",
  CANCELLED: 'Annulée',
};

export const MAINTENANCE_REQUEST_TYPES = {
  UNAVAILABILITY: 'indisponibilite',
  DATE_CHANGE: 'changement_date',
};

export const getMaintenancePlanningRequestTypeLabel = (value) => {
  if (value === MAINTENANCE_REQUEST_TYPES.UNAVAILABILITY) return 'Indisponibilité';
  if (value === MAINTENANCE_REQUEST_TYPES.DATE_CHANGE) return 'Changement de date';
  return value || 'N/A';
};

export const getMaintenancePlanningRequestStatusTone = (status) => {
  if (status === MAINTENANCE_REQUEST_STATUSES.APPROVED) {
    return 'success';
  }

  if (
    status === MAINTENANCE_REQUEST_STATUSES.REFUSED_CHEF ||
    status === MAINTENANCE_REQUEST_STATUSES.REFUSED_EXPLOITATION
  ) {
    return 'danger';
  }

  if (status === MAINTENANCE_REQUEST_STATUSES.CANCELLED) {
    return 'neutral';
  }

  if (status === MAINTENANCE_REQUEST_STATUSES.PENDING_EXPLOITATION) {
    return 'info';
  }

  return 'warning';
};

export const isMissingMaintenancePlanningRequestTableError = (error) =>
  isMissingSupabaseTableError(error, 'planning_maintenance_modification_requests');
