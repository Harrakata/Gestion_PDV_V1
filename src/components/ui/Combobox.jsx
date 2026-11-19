
import React, { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import AnchoredPopover from "@/components/ui/AnchoredPopover"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const normalizeValue = (value) => String(value ?? "").trim().toLowerCase();
const getSearchableValue = (option) => String(
  option.searchValue ?? `${option.label ?? ""} ${option.value ?? ""}`
);

// Combobox single OU multi-select.
// Mode multi : passer `multi={true}` + `value` = array de valeurs + `onSelect(newArray)`.
// La valeur spéciale "__all__" (ALL) déselectionne tout (équivalent "tout afficher").
// `valueLabel` (optionnel) : rappel du titre du champ devant la valeur choisie
// (« Type : 2020 ») quand le libellé est affiché dans le champ (FormField inline).
const Combobox = ({ options, value, onSelect, placeholder, searchPlaceholder, emptyText, disabled, multi = false, modal = false, required, valueLabel, ...triggerProps }) => {
  const valuePrefix = valueLabel
    ? <span className="mr-1 font-normal text-muted-foreground">{valueLabel} :</span>
    : null;
  const [open, setOpen] = useState(false)
  const searchInputRef = React.useRef(null)
  const triggerRef = React.useRef(null)
  const keyboardOpening = React.useRef(false)
  const handleTriggerKeyDown = (event) => {
    triggerProps.onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      keyboardOpening.current = true
      setOpen(true)
    }
  }
  const focusSearchFromKeyboard = () => {
    if (keyboardOpening.current) searchInputRef.current?.focus({ preventScroll: true })
    keyboardOpening.current = false
  }

  // Détection du mode et de la valeur "ALL" (premier option si elle a l'apparence d'une option globale).
  const allOption = options[0] && (options[0].value === "__all__" || options[0].value === "" || String(options[0].value).startsWith("__")) ? options[0] : null;

  if (multi) {
    // value attendu = array. Si chaîne vide / null, on traite comme array vide.
    const values = Array.isArray(value) ? value : [];
    const isAllMode = values.length === 0;
    const isSelected = (v) => values.includes(v);

    // Champ : titre du filtre si rien n'est choisi ; sinon 1re valeur + pastille « +N »
    // (l'ancien « Sous-ensemble (3) » tronqué ne disait pas CE qui était filtré).
    const fieldLabel = allOption?.label ?? placeholder;
    const realOptions = allOption ? options.filter((o) => o !== allOption) : options;
    const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;
    const selectedLabels = values.map(labelOf);
    const triggerTitle = isAllMode ? fieldLabel : `${fieldLabel} : ${selectedLabels.join(', ')}`;

    const toggle = (v) => {
      // Click sur ALL → vider la sélection (équivaut à "tout afficher")
      if (allOption && v === allOption.value) {
        onSelect([]);
        return;
      }
      const next = isSelected(v) ? values.filter((x) => x !== v) : [...values, v];
      onSelect(next);
    };

    return (
      <AnchoredPopover
        open={open}
        onOpenChange={setOpen}
        disabled={disabled}
        align="start"
        matchTriggerWidth
        triggerWrapClassName="block w-full"
        panelClassName="p-0"
        onOpenAutoFocus={focusSearchFromKeyboard}
        trigger={
          <Button
            {...triggerProps}
            ref={triggerRef}
            onKeyDown={handleTriggerKeyDown}
            type="button"
            aria-required={required || undefined}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={triggerTitle}
            title={triggerTitle}
            className={cn("w-full justify-between gap-1", values.length > 0 && "border-primary/50 bg-primary/5 text-primary")}
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate">{isAllMode ? fieldLabel : <>{valuePrefix}{selectedLabels[0]}</>}</span>
              {values.length > 1 && (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[0.65rem] font-bold leading-4 text-primary" aria-hidden="true">
                  +{values.length - 1}
                </span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      >
          <Command>
            <CommandInput ref={searchInputRef} placeholder={searchPlaceholder} aria-label={searchPlaceholder || 'Rechercher une option'} />
            {/* « Tout afficher » : action d'en-tête, pas une ligne de liste (la 1re ligne
                est surlignée par le clavier et paraissait sélectionnée). */}
            <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">
                {isAllMode ? 'Aucun filtre — tout est affiché' : `${values.length} sélectionné(s)`}
              </span>
              {!isAllMode && (
                <button
                  type="button"
                  onClick={() => onSelect([])}
                  className="rounded px-1.5 py-0.5 font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Tout afficher
                </button>
              )}
            </div>
            <CommandList className="max-h-56 overflow-y-auto">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {realOptions.map((option) => {
                  const selected = isSelected(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={getSearchableValue(option)}
                      onSelect={() => toggle(option.value)}
                      aria-checked={selected}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0 text-primary",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className={cn("truncate", selected && "font-semibold")}>{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
      </AnchoredPopover>
    );
  }

  // ─── Mode single (legacy) ───
  const selectedOption = options.find(
    (option) => normalizeValue(option.value) === normalizeValue(value)
  );

  const trigger = (
    <Button
      {...triggerProps}
      ref={triggerRef}
      onKeyDown={handleTriggerKeyDown}
      type="button"
      aria-required={required || undefined}
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className="w-full justify-between"
      disabled={disabled}
    >
      <span className="truncate">
        {selectedOption
          ? <>{valuePrefix}{selectedOption.label}</>
          : <span className={valueLabel ? 'text-muted-foreground' : undefined}>{placeholder}</span>}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const content = (
    <Command>
      <CommandInput ref={searchInputRef} placeholder={searchPlaceholder} aria-label={searchPlaceholder || 'Rechercher une option'} />
      <CommandList className="max-h-56 overflow-y-auto">
        <CommandEmpty>{emptyText}</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={getSearchableValue(option)}
              onSelect={() => {
                onSelect(normalizeValue(option.value) === normalizeValue(value) ? "" : option.value)
                setOpen(false)
                triggerRef.current?.focus({ preventScroll: true })
              }}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4 shrink-0",
                  normalizeValue(value) === normalizeValue(option.value) ? "opacity-100" : "opacity-0"
                )}
              />
              <span className="truncate">{option.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  if (modal) {
    return (
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            searchInputRef.current?.focus()
          }}
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <AnchoredPopover
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
      align="start"
      matchTriggerWidth
      triggerWrapClassName="block w-full"
      panelClassName="p-0"
      onOpenAutoFocus={focusSearchFromKeyboard}
      trigger={trigger}
    >
      {content}
    </AnchoredPopover>
  )
}

export { Combobox };
