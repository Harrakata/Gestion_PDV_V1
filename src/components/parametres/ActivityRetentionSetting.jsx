import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import FeedbackPanel from '@/components/ui/feedback-panel';
import { useToast } from '@/components/ui/use-toast';
import { useConfirm } from '@/components/ConfirmDialogProvider';
import { useReadOnlySettings } from '@/hooks/useReadOnlySettings';
import { SettingGroup, ThemeSegmented, ThemeSettingRow } from '@/components/parametres/SettingControls';
import { describeError, reportError } from '@/lib/errors';
import { loadAppSetting, saveAppSetting } from '@/lib/appSettings';
import { supabase } from '@/lib/supabaseClient';
import { appLocale } from '@/i18n/language';
import {
  PURGE_STATUS_SETTING_KEY, RETENTION_OPTIONS, RETENTION_SETTING_KEY,
  cutoffOf, deletesMore, fromOption, retentionDays, toOption,
} from '@/features/activite/activityRetentionModel';
import { countActivityBefore } from '@/features/activite/activityRetentionRepository';

const number = (value) => Number(value || 0).toLocaleString(appLocale());
const dateTime = (value) => new Date(value).toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' });

/** Paramètres → Mode de ressources → Journaux d'activité : durée de conservation. */
export default function ActivityRetentionSetting() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const readOnly = useReadOnlySettings();
  const [state, setState] = useState(null); // { days, status }
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [setting, status] = await Promise.all([loadAppSetting(RETENTION_SETTING_KEY), loadAppSetting(PURGE_STATUS_SETTING_KEY)]);
      setState({ days: retentionDays(setting), status });
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const askToDelete = async (days) => {
    let description = `Les connexions et les évènements de plus de ${days} jours seront supprimés définitivement, dès la nuit prochaine puis chaque nuit. Le journal d'audit est conservé.`;
    try {
      const { sessions, events } = await countActivityBefore(supabase, cutoffOf(days));
      description = `${number(sessions)} connexion(s) et ${number(events)} évènement(s) de plus de ${days} jours seront supprimés définitivement, dès la nuit prochaine puis chaque nuit. Le journal d'audit est conservé.`;
    } catch (error) {
      reportError(error, { where: 'ActivityRetentionSetting' });
    }
    return confirm({
      title: 'Supprimer les anciens journaux ?',
      description,
      confirmLabel: 'Activer la purge',
      destructive: true,
    });
  };

  const handleChange = async (option) => {
    const days = fromOption(option);
    if (isSaving || days === state.days) return;
    setIsSaving(true);
    try {
      if (deletesMore(days, state.days) && !(await askToDelete(days))) return;
      await saveAppSetting(RETENTION_SETTING_KEY, { days });
      setState((current) => ({ ...current, days }));
      toast({ title: 'Conservation enregistrée', className: 'bg-success text-success-foreground' });
    } catch (error) {
      toast({ title: 'Enregistrement impossible', description: describeError(error, 'ActivityRetentionSetting'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const renderControl = () => {
    if (loadFailed) return <Button type="button" variant="outline" size="sm" onClick={load}>Réessayer</Button>;
    if (!state) return <p className="text-xs text-muted-foreground">Chargement des réglages…</p>;
    if (!state.status) return <FeedbackPanel tone="info" title="Purge non installée sur cette base" description="Appliquer la migration 202611251200_purge_journaux_activite.sql." />;
    const { days, status } = state;
    return (
      <>
        {readOnly
          ? <p className="text-sm font-medium text-foreground">{RETENTION_OPTIONS.find((option) => option.value === toOption(days))?.label || `${days} jours`}</p>
          : <ThemeSegmented ariaLabel="Conservation des journaux d'activité" options={RETENTION_OPTIONS} value={toOption(days)} onChange={handleChange} />}
        {status.scheduled === false && (
          <FeedbackPanel className="mt-2" tone="warning" title="Purge non planifiée" description="Activer l'extension pg_cron dans Supabase, puis relancer la migration 202611251200." />
        )}
        {status.at
          ? <p className="mt-2 text-xs text-muted-foreground">{`Dernière purge : ${dateTime(status.at)}, ${number(status.sessions)} connexion(s) et ${number(status.events)} évènement(s) supprimé(s).`}</p>
          : days !== null && status.scheduled !== false && <p className="mt-2 text-xs text-muted-foreground">Première purge la nuit prochaine.</p>}
      </>
    );
  };

  return (
    <SettingGroup title="Journaux d'activité">
      <ThemeSettingRow title="Conservation" hint="Connexions et navigations. Le journal d'audit n'est jamais purgé.">
        {renderControl()}
      </ThemeSettingRow>
    </SettingGroup>
  );
}
