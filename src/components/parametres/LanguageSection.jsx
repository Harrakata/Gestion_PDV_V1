import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Languages, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CustomizationSection, SettingGroup, ThemeSegmented, ThemeSettingRow } from '@/components/parametres/SettingControls';
import PersonalLanguagePicker from '@/components/PersonalLanguagePicker';
import { describeError } from '@/lib/errors';
import { loadAppSetting } from '@/lib/appSettings';
import { LANGUAGES, getClientLanguage } from '@/i18n/language';
import { LANGUAGE_SETTING_KEY, saveClientLanguage } from '@/i18n/clientLanguage';

/** Paramètres → Langue : langue de l'application pour tout le client, et choix personnel. */
export default function LanguageSection({ isOpen, onToggle }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const value = await loadAppSetting(LANGUAGE_SETTING_KEY);
      const language = value?.language || getClientLanguage();
      setSaved(language);
      setDraft(language);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isOpen && saved === null) load();
  }, [isOpen, saved, load]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const reloading = await saveClientLanguage(draft);
      if (reloading) return;
      setSaved(draft);
      toast({ title: 'Langue enregistrée', description: 'Appliquée à chaque utilisateur au prochain chargement.', className: 'bg-success text-success-foreground' });
    } catch (error) {
      toast({ title: 'Enregistrement impossible', description: describeError(error, 'LanguageSection'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = draft !== saved;
  const control = { isDirty, isLoaded: saved !== null, loadFailed, retry: load };

  return (
    <CustomizationSection
      icon={<Languages className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      title="Langue"
      hint="Langue de l'application : français ou anglais"
      isOpen={isOpen}
      onToggle={onToggle}
      control={control}
    >
      <div className="space-y-5 border-t p-5">
        <SettingGroup title="Pour tous les utilisateurs">
          <ThemeSettingRow title="Langue de l'application" hint="Appliquée à tous les espaces, sur tous les appareils.">
            <ThemeSegmented ariaLabel="Langue de l'application" options={LANGUAGES} value={draft} onChange={setDraft} />
          </ThemeSettingRow>
        </SettingGroup>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-muted-foreground">L'application se recharge pour appliquer la langue.</p>
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? <Clock className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Enregistrer la langue
          </Button>
        </div>
        <SettingGroup title="Pour moi">
          <ThemeSettingRow title="Langue sur cet appareil" hint="Prioritaire sur la langue de tous les utilisateurs.">
            <PersonalLanguagePicker />
          </ThemeSettingRow>
        </SettingGroup>
      </div>
    </CustomizationSection>
  );
}
