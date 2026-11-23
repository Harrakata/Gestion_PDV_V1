import { supabase } from '@/lib/supabaseClient';
import { isMissingTableError } from '@/lib/guichetiereSpace';

export const SOUS_ENSEMBLE_CHANGE_TYPES = {
  maintenance: {
    label: 'Maintenance',
    tone: 'warning',
  },
  configuration: {
    label: 'Configuration',
    tone: 'info',
  },
  stock: {
    label: 'Stock',
    tone: 'neutral',
  },
};

/**
 * Historique des changements de sous-ensembles d'un terminal (par ID_TRM).
 * Alimenté par trigger (migration 202611201200_terminal_sous_ensembles_historique).
 *
 * @returns {Promise<{ rows: object[], missingTable: boolean, error: Error|null }>}
 */
export async function fetchTerminalSousEnsemblesHistory(terminalReference) {
  if (!terminalReference) return { rows: [], missingTable: false, error: null };

  const { data, error } = await supabase
    .from('terminal_sous_ensembles_historique')
    .select('*')
    .eq('terminal_reference', terminalReference)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingTableError(error)) return { rows: [], missingTable: true, error: null };
    return { rows: [], missingTable: false, error };
  }

  return { rows: data || [], missingTable: false, error: null };
}
