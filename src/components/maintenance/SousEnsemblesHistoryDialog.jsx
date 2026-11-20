import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { describeError } from '@/lib/errors';
import {
  SOUS_ENSEMBLE_CHANGE_TYPES,
  fetchTerminalSousEnsemblesHistory,
} from '@/lib/terminalSousEnsemblesHistory';

const formatDateTime = (value) => {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Historique des changements de sous-ensembles d'un terminal.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.terminalReference           ID_TRM
 * @param {Record<string, string>} props.fieldLabels  colonne `*_reference` → libellé
 * @param {Record<string, {nom?: string}>} [props.agenciesById]
 */
const SousEnsemblesHistoryDialog = ({
  open,
  onOpenChange,
  terminalReference,
  fieldLabels = {},
  agenciesById = {},
}) => {
  const [state, setState] = useState({ loading: false, rows: [], missingTable: false, error: '' });
  const [fieldFilter, setFieldFilter] = useState('all');

  useEffect(() => {
    if (!open || !terminalReference) return undefined;
    let active = true;
    setFieldFilter('all');
    setState({ loading: true, rows: [], missingTable: false, error: '' });

    fetchTerminalSousEnsemblesHistory(terminalReference).then(({ rows, missingTable, error }) => {
      if (!active) return;
      setState({
        loading: false,
        rows,
        missingTable,
        error: error ? describeError(error, 'SousEnsemblesHistoryDialog') : '',
      });
    });

    return () => {
      active = false;
    };
  }, [open, terminalReference]);

  const fieldsInHistory = useMemo(
    () => [...new Set(state.rows.map((row) => row.sous_ensemble).filter(Boolean))],
    [state.rows]
  );

  const visibleRows = useMemo(
    () => (fieldFilter === 'all' ? state.rows : state.rows.filter((row) => row.sous_ensemble === fieldFilter)),
    [fieldFilter, state.rows]
  );

  const labelFor = (field) => fieldLabels[field] || (field ? field.replace(/_reference$/, '').replace(/_/g, ' ') : 'Sous-ensemble');

  let content;
  if (state.loading) {
    content = <p className="py-10 text-center text-sm text-muted-foreground">Chargement de l’historique…</p>;
  } else if (state.missingTable) {
    content = (
      <div className="rounded-lg border border-warning/30 bg-warning-muted p-4 text-sm text-warning-muted-foreground">
        L’historique des sous-ensembles n’est pas encore activé sur cette base (migration
        « terminal_sous_ensembles_historique » à appliquer).
      </div>
    );
  } else if (state.error) {
    content = (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {state.error}
      </div>
    );
  } else if (visibleRows.length === 0) {
    content = (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        Aucun changement de sous-ensemble enregistré pour ce terminal.
      </p>
    );
  } else {
    content = (
      <ol className="space-y-3">
        {visibleRows.map((row) => {
          const changeType = SOUS_ENSEMBLE_CHANGE_TYPES[row.type_changement] || SOUS_ENSEMBLE_CHANGE_TYPES.configuration;
          const agencyName = row.agence_id ? agenciesById[String(row.agence_id)]?.nom : null;
          return (
            <li key={row.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{labelFor(row.sous_ensemble)}</span>
                  <Badge className={changeType.className}>{changeType.label}</Badge>
                </div>
                <span className="text-sm text-muted-foreground">{formatDateTime(row.created_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-sm">
                <span className={row.ancienne_reference ? 'text-muted-foreground line-through' : 'text-muted-foreground'}>
                  {row.ancienne_reference || 'Aucun'}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold text-foreground">{row.nouvelle_reference || 'Retiré'}</span>
              </div>
              {agencyName || row.commentaire ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {[agencyName ? `Agence : ${agencyName}` : null, row.commentaire].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <History className="h-5 w-5 shrink-0" />
            Historique des sous-ensembles · {terminalReference}
          </DialogTitle>
          <DialogDescription>
            Remplacements en maintenance, modifications de configuration et mises à jour du stock.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          {fieldsInHistory.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={fieldFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setFieldFilter('all')}
              >
                Tous ({state.rows.length})
              </Button>
              {fieldsInHistory.map((field) => (
                <Button
                  key={field}
                  type="button"
                  size="sm"
                  variant={fieldFilter === field ? 'default' : 'outline'}
                  onClick={() => setFieldFilter(field)}
                >
                  {labelFor(field)}
                </Button>
              ))}
            </div>
          ) : null}
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SousEnsemblesHistoryDialog;
