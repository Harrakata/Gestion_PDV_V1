import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

/**
 * Confirmation et saisie courte, au style de l'application — remplace
 * window.confirm / window.prompt (peu lisibles, non thémés, parfois bloqués
 * en PWA / WebView). API par promesse, pour des remplacements d'une ligne :
 *
 *   const { confirm, prompt } = useConfirm();
 *   if (!(await confirm({ title: 'Supprimer ce modèle ?', destructive: true }))) return;
 *   const name = await prompt({ title: 'Nom de la vue', defaultValue: 'Ma vue' }); // null si annulé
 *
 * Monté une seule fois (App.jsx) via <ConfirmDialogProvider>.
 */

const ConfirmContext = createContext(null);

const EMPTY = { open: false, mode: 'confirm', options: {} };

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [value, setValue] = useState('');
  const resolverRef = useRef(null);
  const inputRef = useRef(null);

  const open = useCallback((mode, options = {}) => new Promise((resolve) => {
    // Une demande encore ouverte est considérée comme annulée.
    resolverRef.current?.(mode === 'prompt' ? null : false);
    resolverRef.current = resolve;
    setValue(options.defaultValue ?? '');
    setState({ open: true, mode, options });
  }), []);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  useEffect(() => {
    if (state.open && state.mode === 'prompt') setTimeout(() => inputRef.current?.select(), 50);
  }, [state.open, state.mode]);

  const api = React.useMemo(() => ({
    confirm: (options) => open('confirm', options),
    prompt: (options) => open('prompt', options),
  }), [open]);

  const { mode, options } = state;
  const destructive = Boolean(options.destructive);
  const Icon = destructive ? AlertTriangle : HelpCircle;
  const cancelResult = mode === 'prompt' ? null : false;
  const submit = () => {
    if (mode === 'prompt') {
      const trimmed = value.trim();
      if (!trimmed && options.required !== false) return;
      close(trimmed);
    } else {
      close(true);
    }
  };

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Dialog open={state.open} onOpenChange={(o) => { if (!o) close(cancelResult); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 space-y-1 text-left">
                  <DialogTitle>{options.title || (mode === 'prompt' ? 'Saisie' : 'Confirmer')}</DialogTitle>
                  {options.description
                    ? <DialogDescription>{options.description}</DialogDescription>
                    : <DialogDescription className="sr-only">{options.title || 'Confirmation'}</DialogDescription>}
                </div>
              </div>
            </DialogHeader>

            {mode === 'prompt' && (
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={options.placeholder}
                aria-label={options.label || options.title || 'Saisie'}
                maxLength={options.maxLength || 120}
              />
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => close(cancelResult)}>
                {options.cancelLabel || 'Annuler'}
              </Button>
              <Button
                type="submit"
                variant={destructive ? 'destructive' : 'default'}
                disabled={mode === 'prompt' && options.required !== false && !value.trim()}
              >
                {options.confirmLabel || (destructive ? 'Supprimer' : 'Valider')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Accès à confirm() / prompt(). Repli sur les boîtes natives hors fournisseur. */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  return {
    confirm: async (o = {}) => window.confirm([o.title, o.description].filter(Boolean).join('\n\n')),
    prompt: async (o = {}) => window.prompt(o.title || '', o.defaultValue || ''),
  };
}
