import React from 'react';
import { Bell, CalendarDays, Home, MoreHorizontal, Smartphone, Ticket, Wrench } from 'lucide-react';
import { useCustomizationDraft } from '@/hooks/useCustomizationDraft';
import {
  MOBILE_CUSTOM_KEY, MOBILE_OPTIONS, MOBILE_PROFILES, MOBILE_SHADOWS, applyMobileCustomization, normalizeMobile,
} from '@/lib/mobileCustomization';
import {
  CustomizationActions, CustomizationSection, PresetPicker, SettingGroup, ThemeSegmented, ThemeSettingRow, ThemeToggle,
} from './SettingControls';

const PREVIEW_TABS = [['Accueil', Home], ['Planning', CalendarDays], ['Tickets', Ticket], ['Réparation', Wrench]];

/** Téléphone miniature aux réglages du brouillon. */
const PhonePreview = ({ settings: s }) => {
  const full = s.tabStyle === 'full';
  const tabs = [...PREVIEW_TABS.slice(0, s.tabCount), ['Plus', MoreHorizontal]];
  const icon = `calc(${s.tabIcon} * 0.85)`;
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[16rem] overflow-hidden rounded-[1.75rem] border-4 border-foreground/80" style={{ backgroundColor: 'var(--page-background)' }}>
      <div className={`flex justify-between px-4 py-1 text-xs font-semibold ${s.statusBar === 'brand' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}>
        <span>08:42</span><span>93 %</span>
      </div>
      <div className="p-2">
        <div className="flex items-center gap-2 rounded-surface border border-border bg-card px-2 py-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">AB</span>
          <span className="flex-1 truncate text-xs font-bold text-foreground">Nom Utilisateur</span>
          <Bell className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`mt-2 space-y-2 rounded-xl border border-border bg-card ${s.cardDensity === 'comfort' ? 'p-4' : 'p-2.5'}`} style={{ zoom: s.fontScale }}>
          <p className="text-xs font-bold text-foreground">Titre de carte</p>
          <div className="h-1.5 w-3/4 rounded-full bg-muted-foreground/20" />
          <div className="flex items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground" style={{ height: `${s.controlHeight}px` }}>Valider</div>
        </div>
        <div className="h-10" />
      </div>
      <div className={full ? '' : 'p-2 pt-0'}>
        <div
          className={`flex items-stretch justify-around gap-0.5 border-border bg-card p-1 ${full ? 'border-t' : 'border'}`}
          style={{ borderRadius: full ? 'var(--radius-surface) var(--radius-surface) 0 0' : 'var(--radius-surface)', boxShadow: MOBILE_SHADOWS[s.tabbarShadow] }}
        >
          {tabs.map(([label, Icon], i) => {
            const active = i === 0;
            const showLabel = s.tabLabels === 'always' || (s.tabLabels === 'active' && active);
            const tone = !active ? 'text-muted-foreground' : s.tabActive === 'solid' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary';
            return (
              <div key={label} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl ${tone}`} style={{ minHeight: `calc((${s.tabHeight} - 1.5rem) * 0.9)` }}>
                <Icon style={{ height: icon, width: icon }} />
                {showLabel ? <span className="max-w-full truncate text-xs font-semibold">{label}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Paramètres → Personnalisation App Mobile. */
const MobileCustomizationSection = ({ isOpen, onToggle }) => {
  const control = useCustomizationDraft({
    settingKey: MOBILE_CUSTOM_KEY, normalize: normalizeMobile, apply: applyMobileCustomization,
  });
  const { draft: settings, update } = control;

  const choice = (key, title, hint) => (
    <ThemeSettingRow title={title} hint={hint}>
      <ThemeSegmented ariaLabel={title} value={settings[key]} onChange={(value) => update({ [key]: value })} options={MOBILE_OPTIONS[key]} />
    </ThemeSettingRow>
  );

  return (
    <CustomizationSection
      icon={<Smartphone aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />}
      title="Personnalisation App Mobile"
      hint="Barre d'onglets, boutons, en-tête et taille d'affichage"
      isOpen={isOpen}
      onToggle={onToggle}
      control={control}
    >
      <div className="grid gap-6 border-t px-5 py-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profils d'usage</p>
            <PresetPicker
              label="Profils d'usage"
              presets={MOBILE_PROFILES}
              isActive={(preset) => Object.entries(normalizeMobile(preset.values)).every(([key, value]) => key === 'animations' || settings[key] === value)}
              onPick={(preset) => update({ ...normalizeMobile(preset.values), animations: settings.animations })}
            />
          </section>

          <SettingGroup title="Boutons et contenu">
            {choice('controlHeight', 'Hauteur des boutons', 'Boutons, listes, champs et onglets, en pixels. 44 convient à un usage debout ou avec des gants.')}
            {choice('fontScale', 'Taille d’affichage', 'Agrandit ou réduit tout le contenu des écrans.')}
            {choice('cardDensity', 'Cartes', 'Espace à l’intérieur des cartes.')}
          </SettingGroup>

          <SettingGroup title="Barre d'onglets (bas d'écran)">
            {choice('tabStyle', 'Position')}
            {choice('tabCount', 'Raccourcis', 'Nombre d’onglets avant « Plus ».')}
            {choice('tabLabels', 'Libellés', 'Masqués à l’écran, ils restent lus par les lecteurs d’écran.')}
            {choice('tabActive', 'Onglet actif')}
            {choice('tabHeight', 'Hauteur')}
            {choice('tabIcon', 'Taille des icônes')}
            {choice('tabbarShadow', 'Ombre')}
          </SettingGroup>

          <SettingGroup title="En-tête et navigation">
            <ThemeSettingRow title="Arrondis" hint="Réglage unique : Personnalisation → Arrondi des coins.">
              <p className="text-xs text-muted-foreground">En-tête, barre d’onglets, menu et fenêtres suivent le même arrondi que l’ordinateur.</p>
            </ThemeSettingRow>
            {choice('statusBar', 'Barre d’état du téléphone', 'Bande de l’heure et de la batterie (application installée, Android).')}
            <ThemeSettingRow title="Animations de navigation" hint="Transitions et glissements entre onglets.">
              <ThemeToggle label="Animations de navigation" checked={settings.animations} onChange={(animations) => update({ animations })} />
            </ThemeSettingRow>
          </SettingGroup>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu</p>
          <PhonePreview settings={settings} />
          <CustomizationActions kind="mobile" control={control} savedTitle="Personnalisation mobile enregistrée" />
        </aside>
      </div>
    </CustomizationSection>
  );
};

export default MobileCustomizationSection;
