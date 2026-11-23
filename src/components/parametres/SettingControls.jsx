import React, { useId, useRef } from 'react';
import { ChevronDown, Clock, Download, RotateCcw, Save, Undo2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FeedbackPanel from '@/components/ui/feedback-panel';
import StatusBadge from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { describeError } from '@/lib/errors';
import { downloadCustomization, readCustomizationFile } from '@/lib/customizationFile';

/** Ligne de réglage : libellé + aide à gauche, contrôle à droite (empilés sur mobile). */
export const ThemeSettingRow = ({ title, hint, children }) => (
  <div className="grid gap-2 py-3 md:grid-cols-[13rem_minmax(0,1fr)] md:items-center md:gap-6">
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

/** Sélecteur segmenté compact (choix exclusif). */
export const ThemeSegmented = ({ options, value, onChange, ariaLabel }) => (
  <div role="radiogroup" aria-label={ariaLabel} className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
    {options.map((o) => {
      const active = o.value === value;
      return (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={active}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-[var(--mobile-control-h)] ${
            active ? 'bg-card text-primary shadow-soft ring-1 ring-primary/30' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      );
    })}
  </div>
);

/** Interrupteur accessible (role="switch"). */
export const ThemeToggle = ({ checked, onChange, label, disabled = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
  >
    <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

/** Groupe de réglages titré. */
export const SettingGroup = ({ title, children }) => (
  <section>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    <div className="divide-y divide-border">{children}</div>
  </section>
);

/** Choix d'une combinaison prête à l'emploi. */
export const PresetPicker = ({ label, presets, isActive, onPick }) => (
  <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
    {presets.map((preset) => {
      const active = isActive(preset);
      return (
        <button
          key={preset.id}
          type="button"
          aria-pressed={active}
          onClick={() => onPick(preset)}
          className={`flex flex-col justify-start rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'}`}
        >
          <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{preset.name}</span>
          <span className="block text-xs text-muted-foreground">{preset.hint}</span>
        </button>
      );
    })}
  </div>
);

/** Section dépliable ; le contenu reste monté pour garder le brouillon en cours. */
export const CustomizationSection = ({ icon, title, hint, isOpen, onToggle, control, children }) => {
  const panelId = useId();
  const { isDirty, isLoaded, loadFailed, retry } = control;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
        onClick={onToggle}
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="text-base font-semibold">{title}</span>
          <span className="sr-only text-xs text-muted-foreground sm:not-sr-only"> — {hint}</span>
        </span>
        {isDirty ? <StatusBadge tone="warning">Non enregistré</StatusBadge> : null}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!isOpen}>
        {!isOpen ? null : isLoaded ? children : (
          <div className="border-t p-5">
            {loadFailed ? (
              <FeedbackPanel
                tone="warning"
                title="Réglages indisponibles"
                description="Ils n'ont pas pu être chargés. Vérifiez la connexion puis réessayez."
              >
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>Réessayer</Button>
              </FeedbackPanel>
            ) : <p className="text-sm text-muted-foreground">Chargement des réglages…</p>}
          </div>
        )}
      </div>
    </div>
  );
};

/** Barre d'actions commune : enregistrer, annuler, réinitialiser, exporter, importer. */
export const CustomizationActions = ({ kind, control, savedTitle }) => {
  const { toast } = useToast();
  const fileRef = useRef(null);
  const { draft, isDirty, dirtyKeys, isSaving, isLoaded, save, cancel, reset, replace } = control;

  const handleSave = async () => {
    try {
      await save();
      toast({ title: savedTitle, description: 'Appliqué à tous les utilisateurs au prochain chargement.', className: 'bg-success text-success-foreground' });
    } catch (error) {
      toast({ title: 'Enregistrement impossible', description: describeError(error, 'CustomizationActions'), variant: 'destructive' });
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      replace(await readCustomizationFile(file, kind));
      toast({ title: 'Réglages importés en aperçu', description: 'Vérifiez le rendu, puis enregistrez.' });
    } catch {
      toast({ title: 'Fichier non reconnu', description: 'Choisissez un fichier exporté depuis cette section.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <p role="status" className="text-xs text-muted-foreground">
        {isDirty
          ? `${dirtyKeys.length} modification${dirtyKeys.length > 1 ? 's' : ''} en aperçu, visible${dirtyKeys.length > 1 ? 's' : ''} par vous seul.`
          : 'Aucune modification en attente.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={!isDirty || isSaving}>
          <Undo2 className="h-4 w-4" aria-hidden="true" /> Annuler
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving || !isLoaded}>
          {isSaving ? <Clock className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Enregistrer
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={isSaving} className="col-span-2">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Valeurs par défaut
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => downloadCustomization(kind, draft)}>
          <Download className="h-4 w-4" aria-hidden="true" /> Exporter
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={isSaving}>
          <Upload className="h-4 w-4" aria-hidden="true" /> Importer
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Fichier de réglages" onChange={handleImport} />
      </div>
    </div>
  );
};
