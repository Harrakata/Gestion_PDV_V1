import { useCallback, useEffect, useState } from 'react';
import { Clock, Gauge, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FeedbackPanel from '@/components/ui/feedback-panel';
import { useToast } from '@/components/ui/use-toast';
import { CustomizationSection, SettingGroup, ThemeSegmented, ThemeSettingRow } from '@/components/parametres/SettingControls';
import { useReadOnlySettings } from '@/hooks/useReadOnlySettings';
import ActivityRetentionSetting from '@/components/parametres/ActivityRetentionSetting';
import { describeError } from '@/lib/errors';
import { loadAppSetting } from '@/lib/appSettings';
import {
  RESOURCE_MODES, RESOURCE_MODE_SETTING_KEY, RESOURCE_PROFILES,
  getDeviceResourceMode, getSharedResourceMode, imposedResourceMode, isResourceModeOutdated, resourceMode, setDeviceResourceMode,
} from '@/lib/resourceMode';
import { saveClientResourceMode } from '@/lib/clientResourceMode';

const SUMMARIES = {
  dev: 'Strict minimum pour développer et tester : les données s’actualisent à l’ouverture d’un écran, au retour sur l’application et à l’ouverture de la cloche.',
  demo: 'Toutes les fonctions, en restant dans l’abonnement gratuit de Supabase.',
  prod: 'Réactivité maximale. À réserver à un abonnement payant.',
};

const NONE = '—';
const delay = (ms) => {
  if (!Number.isFinite(ms)) return 'Jamais';
  const minutes = Math.round(ms / 60000);
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
};
const navigationLabel = ({ log, groupFor }) => {
  if (!log) return 'Non';
  return groupFor ? 'Regroupé' : 'Immédiat';
};

// Comparaison lue dans les réglages eux-mêmes : elle ne peut pas s'en écarter.
const ROWS = [
  { label: 'Temps réel', value: (p) => (p.realtime ? 'Oui' : 'Non') },
  { label: 'Actualisation, temps réel actif', value: (p) => (p.realtime ? delay(p.feed.live) : NONE) },
  { label: 'Actualisation sans temps réel', value: (p) => delay(p.feed.fallback) },
  { label: 'Actualisation en arrière-plan', value: (p) => delay(p.realtime ? p.feed.liveHidden : p.feed.fallbackHidden) },
  { label: 'Signal de présence', value: (p) => delay(p.presence) },
  { label: 'Journal de navigation', value: (p) => navigationLabel(p.navigation) },
  { label: 'Santé de la synchro, sans changement', value: (p) => delay(p.syncHealthKeepAlive) },
  { label: 'Taille des photos', value: (p) => `${p.photo.maxSide} px` },
];

const labelOf = (value) => RESOURCE_MODES.find((mode) => mode.value === value)?.label;

const FOLLOW = 'shared';
const DEVICE_OPTIONS = [{ value: FOLLOW, label: 'Comme tous' }, ...RESOURCE_MODES];

/** Paramètres → Mode de ressources : Dev, Démo ou Prod, pour tous et sur cet appareil. */
export default function ResourceModeSection({ isOpen, onToggle }) {
  const { toast } = useToast();
  const readOnly = useReadOnlySettings();
  const canChoose = !imposedResourceMode && !readOnly;
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [device, setDevice] = useState(() => getDeviceResourceMode() || FOLLOW);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    if (imposedResourceMode) {
      setSaved(imposedResourceMode);
      setDraft(imposedResourceMode);
      return;
    }
    try {
      const value = await loadAppSetting(RESOURCE_MODE_SETTING_KEY);
      const mode = RESOURCE_PROFILES[value?.mode] ? value.mode : getSharedResourceMode();
      setSaved(mode);
      setDraft(mode);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen && saved === null) load();
  }, [isOpen, saved, load]);

  const applyHere = () => {
    if (!isResourceModeOutdated()) return false;
    window.location.reload();
    return true;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveClientResourceMode(draft);
      setSaved(draft);
      if (applyHere()) return;
      toast({ title: 'Mode enregistré', description: 'Appliqué à chaque utilisateur au prochain chargement.', className: 'bg-success text-success-foreground' });
    } catch (error) {
      toast({ title: 'Enregistrement impossible', description: describeError(error, 'ResourceModeSection'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDevice = (next) => {
    setDevice(next);
    setDeviceResourceMode(next === FOLLOW ? null : next);
    applyHere();
  };

  const isDirty = draft !== saved;
  const control = { isDirty, isLoaded: saved !== null, loadFailed, retry: load };

  return (
    <CustomizationSection
      icon={<Gauge className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      title="Mode de ressources"
      hint="Consommation Supabase : développement, démonstration ou production"
      isOpen={isOpen}
      onToggle={onToggle}
      control={control}
    >
      <div className="space-y-5 border-t p-5">
        <SettingGroup title="Pour tous les utilisateurs">
          <ThemeSettingRow title="Mode" hint="Ne change ni les droits ni les fonctions : seulement le rythme des appels et le poids des photos.">
            {imposedResourceMode && (
              <FeedbackPanel tone="info" title={`Imposé par ce déploiement : ${labelOf(imposedResourceMode)}`} description="Variable VITE_RESOURCE_MODE." />
            )}
            {canChoose && <ThemeSegmented ariaLabel="Mode de ressources" options={RESOURCE_MODES} value={draft} onChange={setDraft} />}
            {!canChoose && !imposedResourceMode && <p className="text-sm font-medium text-foreground">{labelOf(draft)}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{SUMMARIES[draft]}</p>
          </ThemeSettingRow>
        </SettingGroup>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <caption className="sr-only">Comparaison des modes de ressources</caption>
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <td className="px-3 py-2 max-md:!px-1" />
                {RESOURCE_MODES.map((mode) => (
                  <th key={mode.value} scope="col" className={`px-3 py-2 text-left font-semibold tracking-normal max-md:!px-1 ${mode.value === draft ? 'text-primary' : 'text-muted-foreground'}`}>{mode.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="whitespace-normal px-3 py-2 text-left font-medium text-foreground max-md:!px-1">{row.label}</th>
                  {RESOURCE_MODES.map((mode) => (
                    <td key={mode.value} className={`whitespace-nowrap px-3 py-2 max-md:!px-1 ${mode.value === draft ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>{row.value(RESOURCE_PROFILES[mode.value])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canChoose && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-xs text-muted-foreground">Appliqué à chaque utilisateur au prochain chargement de l'application.</p>
            <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
              {isSaving ? <Clock className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Enregistrer le mode
            </Button>
          </div>
        )}

        <ActivityRetentionSetting />

        <SettingGroup title="Pour moi">
          <ThemeSettingRow title="Mode sur cet appareil" hint="Pour essayer un mode sans l'imposer aux autres. Prioritaire ; la page se recharge.">
            <ThemeSegmented ariaLabel="Mode sur cet appareil" options={DEVICE_OPTIONS} value={device} onChange={handleDevice} />
          </ThemeSettingRow>
        </SettingGroup>
        <p className="text-xs text-muted-foreground">Mode actif sur cet appareil : <span className="font-semibold text-foreground">{labelOf(resourceMode)}</span></p>
      </div>
    </CustomizationSection>
  );
}
