import React, { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCustomizationDraft } from '@/hooks/useCustomizationDraft';
import {
  APPEARANCE_PRESETS, COLOR_PRESETS, DENSITY_PRESETS, FONT_PRESETS, PAGE_BACKGROUNDS, PAGE_PATTERNS,
  SHADOW_PRESETS, SIDEBAR_STYLES, SIDEBAR_WIDTHS, THEME_AMBIANCES, THEME_STORAGE_KEY, WIDTH_PRESETS, ZOOM_OPTIONS,
  applyTheme, getDisplayedColors, hexToHsl, hslToHex, normalizeTheme, serializeTheme,
} from '@/lib/theme';
import {
  CustomizationActions, CustomizationSection, PresetPicker, SettingGroup, ThemeSegmented, ThemeSettingRow, ThemeToggle,
} from './SettingControls';

const toOptions = (presets) => presets.map((p) => ({ value: p.id, label: p.name, title: p.hint }));
const hintOf = (presets, id) => presets.find((p) => p.id === id)?.hint;
const APPEARANCE_ICONS = { light: Sun, dark: Moon, auto: Monitor };
const RADIUS_OPTIONS = [0, 0.25, 0.5, 0.75, 0.875, 1, 1.25, 1.5];

/** Couleur de marque : palette, sélecteur libre, code hexadécimal, rendu réel. */
const ColorPicker = ({ value, onChange }) => {
  const preset = COLOR_PRESETS.find((p) => p.hsl === value);
  const hex = preset?.hex ?? hslToHex(value);
  const [text, setText] = useState(hex);
  useEffect(() => setText(hex), [hex]);
  const pickHex = (next) => onChange(COLOR_PRESETS.find((p) => p.hex === next)?.hsl ?? hexToHsl(next));
  const displayed = getDisplayedColors(value);
  const adjusted = displayed && (displayed.light.adjusted || displayed.dark.adjusted);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Couleur principale">
          {COLOR_PRESETS.map((p) => {
            const active = p.hsl === value;
            return (
              <button
                key={p.name}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={p.name}
                title={p.name}
                onClick={() => onChange(p.hsl)}
                className={`flex h-8 w-8 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-md:h-9 max-md:w-9 ${active ? 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-card' : ''}`}
                style={{ backgroundColor: p.hex }}
              >
                {active && <Check aria-hidden="true" className="h-4 w-4 text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
        {/* Enveloppe : hors de la règle CSS « libellé dans le champ » (label + champ voisins). */}
        <span>
        <label
          title="Couleur personnalisée"
          className={`relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border max-md:h-9 max-md:w-9 ${preset ? '' : 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-card'}`}
          style={{ backgroundColor: preset ? 'transparent' : hex }}
        >
          {preset ? <Palette aria-hidden="true" className="h-4 w-4 text-muted-foreground" /> : <Check aria-hidden="true" className="h-4 w-4 text-white drop-shadow" />}
          <span className="sr-only">Couleur personnalisée</span>
          <input type="color" value={hex} onChange={(e) => pickHex(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
        </span>
        <Input
          value={text}
          aria-label="Code hexadécimal de la couleur"
          maxLength={7}
          spellCheck={false}
          className="h-9 w-28 font-mono"
          onChange={(e) => {
            const next = e.target.value.trim().toLowerCase();
            setText(next);
            if (/^#[0-9a-f]{6}$/.test(next)) pickHex(next);
          }}
          onBlur={() => setText(hex)}
        />
      </div>
      {displayed ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {[['Clair', displayed.light], ['Sombre', displayed.dark]].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-4 w-4 rounded border border-border" style={{ backgroundColor: color.hex }} />
              {label} : <span className="font-mono">{color.hex}</span>
            </span>
          ))}
          <span>{adjusted ? 'Luminosité ajustée pour que les textes restent lisibles.' : 'Couleur affichée telle quelle.'}</span>
        </div>
      ) : null}
    </div>
  );
};

/** Maquette de l'application aux couleurs du brouillon. */
const DesktopPreview = ({ theme }) => {
  const brand = theme.sidebarStyle === 'brand';
  const radius = `${Math.min(theme.radius, 1)}rem`;
  const gap = { compact: 'py-1', normal: 'py-1.5', comfort: 'py-2.5' }[theme.density];
  const pattern = PAGE_PATTERNS.find((p) => p.id === theme.pagePattern);
  return (
    <div
      aria-hidden="true"
      className="flex gap-2 overflow-hidden rounded-xl border border-border p-2"
      style={{ backgroundColor: 'var(--page-background)', backgroundImage: pattern.image, backgroundSize: pattern.size }}
    >
      <div
        className={`shrink-0 space-y-1.5 border p-1.5 ${brand ? 'border-primary bg-primary' : 'border-border bg-card'}`}
        style={{
          borderRadius: radius,
          width: { narrow: '3.25rem', normal: '4rem', wide: '4.75rem' }[theme.sidebarWidth],
          ...(theme.sidebarStyle === 'tinted' ? { backgroundColor: 'color-mix(in srgb, hsl(var(--primary)) 8%, hsl(var(--card)))' } : {}),
        }}
      >
        <div className={`h-2 w-3/4 rounded-full ${brand ? 'bg-primary-foreground' : 'bg-primary'}`} />
        <div className={`h-4 rounded ${brand ? 'bg-primary-foreground' : 'bg-primary/15'}`} />
        {[0, 1, 2].map((i) => <div key={i} className={`h-1.5 rounded-full ${brand ? 'bg-primary-foreground/50' : 'bg-foreground/20'}`} />)}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="relative overflow-hidden border border-border bg-card p-2" style={{ borderRadius: radius }}>
          {theme.cardRail ? <span className="absolute inset-x-0 top-0 h-1 bg-primary" /> : null}
          <p className="text-xs font-bold text-foreground">Titre d’écran</p>
          <p className="text-xs text-muted-foreground">Texte secondaire</p>
        </div>
        <div className="overflow-hidden border border-border bg-card" style={{ borderRadius: radius }}>
          {['Agence A', 'Agence B', 'Agence C'].map((label, i) => (
            <div key={label} className={`flex justify-between border-b border-border px-2 text-xs text-foreground last:border-0 ${gap} ${theme.stripedTables && i % 2 ? 'bg-muted/60' : ''}`}>
              <span>{label}</span><span className="font-semibold text-primary">{72 - i * 9}%</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground" style={{ borderRadius: radius }}>Valider</span>
          <span className="border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground" style={{ borderRadius: radius }}>Annuler</span>
        </div>
      </div>
    </div>
  );
};

/** Paramètres → Personnalisation : apparence de l'application pour tous. */
const ThemeCustomizationSection = ({ isOpen, onToggle }) => {
  const control = useCustomizationDraft({
    settingKey: THEME_STORAGE_KEY, normalize: normalizeTheme, apply: applyTheme, serialize: serializeTheme,
  });
  const { draft: theme, update } = control;

  return (
    <CustomizationSection
      icon={<Palette aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />}
      title="Personnalisation"
      hint="Couleurs, texte, menu et mise en page de l'application"
      isOpen={isOpen}
      onToggle={onToggle}
      control={control}
    >
      <div className="grid gap-6 border-t px-5 py-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-6">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ambiances</p>
            <PresetPicker
              label="Ambiances"
              presets={THEME_AMBIANCES}
              isActive={(preset) => Object.entries(preset.values).every(([key, value]) => theme[key] === value)}
              onPick={(preset) => update(preset.values)}
            />
          </section>

          <SettingGroup title="Couleurs et formes">
            <ThemeSettingRow title="Couleur principale" hint={COLOR_PRESETS.find((p) => p.hsl === theme.primaryHsl)?.name ?? 'Personnalisée'}>
              <ColorPicker value={theme.primaryHsl} onChange={(primaryHsl) => update({ primaryHsl })} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Apparence" hint={hintOf(APPEARANCE_PRESETS, theme.appearance)}>
              <ThemeSegmented
                ariaLabel="Apparence"
                value={theme.appearance}
                onChange={(appearance) => update({ appearance })}
                options={APPEARANCE_PRESETS.map((p) => {
                  const Icon = APPEARANCE_ICONS[p.id];
                  return { value: p.id, label: p.name, title: p.hint, icon: <Icon aria-hidden="true" className="h-3.5 w-3.5" /> };
                })}
              />
            </ThemeSettingRow>
            <ThemeSettingRow title="Arrondi des coins" hint="Toute l’application : ordinateur et téléphone.">
              <ThemeSegmented
                ariaLabel="Arrondi des coins"
                value={theme.radius}
                onChange={(radius) => update({ radius })}
                options={RADIUS_OPTIONS.map((r) => ({ value: r, label: r === 0 ? 'Droit' : `${Math.round(r * 16)} px` }))}
              />
            </ThemeSettingRow>
            <ThemeSettingRow title="Ombre des cartes">
              <ThemeSegmented ariaLabel="Ombre des cartes" value={theme.shadowId} onChange={(shadowId) => update({ shadowId })} options={toOptions(SHADOW_PRESETS)} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Liseré des en-têtes" hint="Bande de couleur en haut de l'en-tête d'écran.">
              <ThemeToggle label="Liseré des en-têtes" checked={theme.cardRail} onChange={(cardRail) => update({ cardRail })} />
            </ThemeSettingRow>
          </SettingGroup>

          <SettingGroup title="Fond de page">
            <ThemeSettingRow title="Couleur" hint={hintOf(PAGE_BACKGROUNDS, theme.pageBackground)}>
              <ThemeSegmented ariaLabel="Couleur du fond de page" value={theme.pageBackground} onChange={(pageBackground) => update({ pageBackground })} options={toOptions(PAGE_BACKGROUNDS)} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Motif">
              <ThemeSegmented ariaLabel="Motif du fond de page" value={theme.pagePattern} onChange={(pagePattern) => update({ pagePattern })} options={toOptions(PAGE_PATTERNS)} />
            </ThemeSettingRow>
          </SettingGroup>

          <SettingGroup title="Texte">
            <ThemeSettingRow title="Police d'écriture">
              <ThemeSegmented
                ariaLabel="Police d'écriture"
                value={theme.fontId}
                onChange={(fontId) => update({ fontId })}
                options={FONT_PRESETS.map((font) => ({
                  value: font.id,
                  label: font.name,
                  icon: <span aria-hidden="true" className="text-sm font-bold" style={{ fontFamily: font.stack }}>Aa</span>,
                }))}
              />
            </ThemeSettingRow>
            <ThemeSettingRow title="Taille d'affichage" hint={`${ZOOM_OPTIONS.find((o) => o.value === theme.zoom)?.hint}. Agit aussi sur le téléphone.`}>
              <ThemeSegmented
                ariaLabel="Taille d'affichage"
                value={theme.zoom}
                onChange={(zoom) => update({ zoom })}
                options={ZOOM_OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.hint }))}
              />
            </ThemeSettingRow>
            <ThemeSettingRow title="Contraste renforcé" hint="Textes secondaires et bordures plus marqués.">
              <ThemeToggle label="Contraste renforcé" checked={theme.highContrast} onChange={(highContrast) => update({ highContrast })} />
            </ThemeSettingRow>
          </SettingGroup>

          <SettingGroup title="Ordinateur : menu et mise en page">
            <ThemeSettingRow title="Style du menu" hint={hintOf(SIDEBAR_STYLES, theme.sidebarStyle)}>
              <ThemeSegmented ariaLabel="Style du menu latéral" value={theme.sidebarStyle} onChange={(sidebarStyle) => update({ sidebarStyle })} options={toOptions(SIDEBAR_STYLES)} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Largeur du menu">
              <ThemeSegmented ariaLabel="Largeur du menu latéral" value={theme.sidebarWidth} onChange={(sidebarWidth) => update({ sidebarWidth })} options={toOptions(SIDEBAR_WIDTHS)} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Densité" hint={hintOf(DENSITY_PRESETS, theme.density)}>
              <ThemeSegmented ariaLabel="Densité" value={theme.density} onChange={(density) => update({ density })} options={toOptions(DENSITY_PRESETS)} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Largeur du contenu" hint={hintOf(WIDTH_PRESETS, theme.contentWidth)}>
              <ThemeSegmented ariaLabel="Largeur du contenu" value={theme.contentWidth} onChange={(contentWidth) => update({ contentWidth })} options={toOptions(WIDTH_PRESETS)} />
            </ThemeSettingRow>
            <ThemeSettingRow title="Tableaux rayés" hint="Alterne la couleur des lignes.">
              <ThemeToggle label="Tableaux rayés" checked={theme.stripedTables} onChange={(stripedTables) => update({ stripedTables })} />
            </ThemeSettingRow>
          </SettingGroup>

          <SettingGroup title="Confort">
            <ThemeSettingRow title="Animations et transitions" hint="Désactiver pour une interface plus réactive ou pour l'accessibilité.">
              <ThemeToggle label="Animations et transitions" checked={theme.animations} onChange={(animations) => update({ animations })} />
            </ThemeSettingRow>
          </SettingGroup>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu</p>
          <DesktopPreview theme={theme} />
          <CustomizationActions kind="theme" control={control} savedTitle="Personnalisation enregistrée" />
        </aside>
      </div>
    </CustomizationSection>
  );
};

export default ThemeCustomizationSection;
