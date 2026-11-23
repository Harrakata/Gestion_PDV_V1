import React, { useRef, useState } from 'react';
import { format, getDay, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WEEK_DAYS = [['L', 'Lundi'], ['M', 'Mardi'], ['M', 'Mercredi'], ['J', 'Jeudi'], ['V', 'Vendredi'], ['S', 'Samedi'], ['D', 'Dimanche']];
const MAX_DOTS = 3;
const SWIPE_DISTANCE = 45;   // px
const SWIPE_RATIO = 1.5;     // mouvement franchement horizontal
const dayKey = (day) => format(day, 'yyyy-MM-dd');

/** Ligne du détail : pastille, titre, précision, action facultative. */
const DayItem = ({ item }) => {
  const content = (
    <>
      <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.badgeClass || 'bg-primary text-primary-foreground'}`}>
        {item.badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
        {item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
      </span>
      {item.alert ? <span className="shrink-0 text-xs font-semibold text-warning-muted-foreground">{item.alert}</span> : null}
    </>
  );
  const rowClass = 'flex min-h-[var(--mobile-control-h)] min-w-0 flex-1 items-center gap-2 py-1 text-left';
  return (
    <li className="flex items-center gap-1 border-b border-border px-2 last:border-0">
      {item.onClick
        ? <button type="button" onClick={item.onClick} className={rowClass}>{content}</button>
        : <div className={rowClass}>{content}</div>}
      {item.action ? (
        <Button type="button" variant="ghost" size="icon" aria-label={item.action.label} onClick={item.action.onClick} disabled={item.action.disabled}>
          {item.action.icon}
        </Button>
      ) : null}
    </li>
  );
};

/**
 * Calendrier compact pour téléphone : les sept jours tiennent dans la largeur, chaque
 * case montre le numéro et des points de couleur ; le détail du jour touché s'affiche
 * dessous. Glisser vers la gauche ou la droite change de période ; `data-no-swipe`
 * empêche ce geste de changer aussi d'onglet (SwipeTabs).
 *
 * @param {object} p
 * @param {Date[]} p.days                      jours affichés (mois ou semaine, dans l'ordre)
 * @param {(day: Date) => Array<object>} p.getItems
 *   { key, title, subtitle?, badge?, badgeClass?, dot?, alert?, onClick?, action? }
 * @param {(day: Date) => void} [p.onAdd]
 * @param {(day: Date) => boolean} [p.canAdd]
 * @param {string} [p.addLabel]
 * @param {string} [p.emptyLabel]
 * @param {Date|null} [p.selectedDate]        jour affiché, piloté par la page (sélecteur de date)
 * @param {(day: Date) => void} [p.onSelectDate]
 * @param {string} p.periodLabel               « novembre 2026 », « Semaine du… »
 * @param {() => void} p.onPrev
 * @param {() => void} p.onNext
 * @param {string} [p.itemNoun]                mot compté dans le nom accessible d'une case
 */
export default function MobilePlanningCalendar({
  days,
  getItems,
  selectedDate,
  onSelectDate,
  periodLabel,
  onPrev,
  onNext,
  onAdd,
  canAdd = () => true,
  addLabel = 'Ajouter',
  emptyLabel = 'Rien de prévu ce jour.',
  itemNoun = 'élément',
}) {
  const [ownDate, setOwnDate] = useState(null);
  const currentDate = onSelectDate ? selectedDate : ownDate;
  const selectDay = onSelectDate || setOwnDate;
  const selectedKey = currentDate ? dayKey(currentDate) : null;
  const [direction, setDirection] = useState(0);
  const touchStart = useRef(null);
  const today = new Date();

  const go = (step) => {
    setDirection(step);
    if (step > 0) onNext(); else onPrev();
  };
  const swipeHandlers = {
    onTouchStart: (event) => {
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      touchStart.current = touch && { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (event) => {
      const start = touchStart.current;
      touchStart.current = null;
      const touch = event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
      go(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => { touchStart.current = null; },
    onKeyDown: (event) => {
      if (event.key !== 'PageUp' && event.key !== 'PageDown') return;
      event.preventDefault();
      go(event.key === 'PageDown' ? 1 : -1);
    },
  };
  const cells = days.map((day) => ({ day, key: dayKey(day), items: getItems(day) }));

  // Jour affiché : celui touché s'il est dans la période, sinon aujourd'hui, sinon le
  // premier jour rempli.
  const selected = cells.find((cell) => cell.key === selectedKey)
    || cells.find((cell) => isSameDay(cell.day, today))
    || cells.find((cell) => cell.items.length > 0)
    || cells[0];
  if (!selected) return null;

  const offset = (getDay(days[0]) + 6) % 7;

  return (
    <div
      data-mobile-calendar
      data-no-swipe
      className="touch-pan-y overflow-hidden rounded-xl border border-border bg-card"
      {...swipeHandlers}
    >
      {/* Le geste suffit au doigt ; ces boutons servent au clavier et aux lecteurs d'écran. */}
      <div className="relative flex min-h-[var(--mobile-control-h)] items-center justify-center border-b border-border px-2">
        {[[-1, 'Période précédente', 'focus-visible:left-1'], [1, 'Période suivante', 'focus-visible:right-1']].map(([step, label, side]) => (
          <button
            key={label}
            type="button"
            onClick={() => go(step)}
            className={`sr-only focus-visible:not-sr-only focus-visible:absolute ${side} focus-visible:rounded-md focus-visible:bg-card focus-visible:px-2 focus-visible:py-1 focus-visible:text-xs focus-visible:ring-2 focus-visible:ring-ring`}
          >
            {label}
          </button>
        ))}
        <p aria-live="polite" className="truncate text-sm font-semibold text-foreground first-letter:uppercase">{periodLabel}</p>
      </div>
      <div className="grid grid-cols-7 border-b border-border bg-muted/50" aria-hidden="true">
        {WEEK_DAYS.map(([letter, name]) => (
          <span key={name} className="py-1 text-center text-xs font-bold text-muted-foreground">{letter}</span>
        ))}
      </div>
      <div
        key={cells[0].key}
        className={`grid grid-cols-7 gap-0.5 p-1 ${direction > 0 ? 'animate-in fade-in-0 slide-in-from-right-8 duration-200' : direction < 0 ? 'animate-in fade-in-0 slide-in-from-left-8 duration-200' : ''}`}
      >
        {Array.from({ length: offset }, (_, i) => <span key={`vide-${i}`} aria-hidden="true" />)}
        {cells.map(({ day, key, items }) => {
          const isToday = isSameDay(day, today);
          const isSelected = key === selected.key;
          const dots = [...new Set(items.map((item) => item.dot || 'bg-primary'))].slice(0, MAX_DOTS);
          const isWeekend = [0, 6].includes(getDay(day));
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectDay(day)}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${format(day, 'EEEE d MMMM', { locale: fr })}${items.length ? `, ${items.length} ${itemNoun}${items.length > 1 ? 's' : ''}` : ''}`}
              className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary' : isWeekend ? 'bg-muted/40' : ''
              }`}
            >
              <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                isToday ? 'bg-primary text-primary-foreground' : isSelected ? 'text-primary' : 'text-foreground'
              }`}>
                {format(day, 'd')}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                {dots.map((dot) => <span key={dot} className={`h-1.5 w-1.5 rounded-full ${dot}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <section aria-live="polite" aria-label="Détail du jour" className="border-t border-border">
        <div className="flex min-h-[var(--mobile-control-h)] items-center justify-between gap-2 bg-muted/50 px-2 py-1">
          <p className="min-w-0 truncate text-xs font-semibold text-foreground first-letter:uppercase">
            {format(selected.day, 'EEEE d MMMM', { locale: fr })}
          </p>
          {onAdd && canAdd(selected.day) ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onAdd(selected.day)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {addLabel}
            </Button>
          ) : null}
        </div>
        {selected.items.length > 0
          ? <ul className="max-h-72 overflow-y-auto">{selected.items.map((item) => <DayItem key={item.key} item={item} />)}</ul>
          : <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>}
      </section>
    </div>
  );
}
