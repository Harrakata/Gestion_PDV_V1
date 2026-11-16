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

export const getMaintenancePlanningRequestStatusBadgeClass = (status) => {
  if (status === MAINTENANCE_REQUEST_STATUSES.APPROVED) {
    return 'border-success/25 bg-success-muted text-success-muted-foreground';
  }

  if (
    status === MAINTENANCE_REQUEST_STATUSES.REFUSED_CHEF ||
    status === MAINTENANCE_REQUEST_STATUSES.REFUSED_EXPLOITATION
  ) {
    return 'border-destructive/25 bg-destructive/10 text-destructive';
  }

  if (status === MAINTENANCE_REQUEST_STATUSES.CANCELLED) {
    return 'border-border bg-muted text-foreground';
  }

  if (status === MAINTENANCE_REQUEST_STATUSES.PENDING_EXPLOITATION) {
    return 'border-info/25 bg-info-muted text-info-muted-foreground';
  }

  return 'border-warning/25 bg-warning-muted text-warning-muted-foreground';
};

export const isMissingMaintenancePlanningRequestTableError = (error) =>
  isMissingSupabaseTableError(error, 'planning_maintenance_modification_requests');
