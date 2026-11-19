
import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Filtres vs champs de formulaire.
// Une liste qui propose une option « toutes » (ALL_VALUES) est un FILTRE :
//   - sur « toutes »  → déclencheur data-all : seul le titre s'affiche (« Région ») ;
//   - valeur choisie  → déclencheur data-filter : seule la valeur s'affiche, en
//     style « filtre actif » (comme les filtres à choix multiple).
// Une liste SANS option « toutes » est un champ de formulaire : le titre reste
// affiché au-dessus de la valeur. Le rendu est fait par le CSS (fin d'index.css).
const ALL_VALUES = new Set(['__all__', 'all', 'tous', 'toutes']);
const SelectFilterContext = React.createContext({ isAll: false, isFilter: false, markFilter: null });

const Select = ({ value, ...props }) => {
  const [isFilter, setIsFilter] = React.useState(false);
  const markFilter = React.useCallback(() => setIsFilter(true), []);
  const ctx = React.useMemo(() => ({
    isAll: value != null && ALL_VALUES.has(String(value)),
    isFilter,
    markFilter,
  }), [value, isFilter, markFilter]);
  return (
    <SelectFilterContext.Provider value={ctx}>
      <SelectPrimitive.Root value={value} {...props} />
    </SelectFilterContext.Provider>
  );
};
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const { isAll, isFilter } = React.useContext(SelectFilterContext);
  return (
  <SelectPrimitive.Trigger
    ref={ref}
    data-all={isAll ? '' : undefined}
    data-filter={isFilter ? '' : undefined}
    className={cn(
      'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft ring-offset-background transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 min-w-[8rem] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-floating data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef(({ className, children, ...props }, ref) => {
  // Une option « toutes » fait de la liste un filtre (cf. Select).
  const { markFilter } = React.useContext(SelectFilterContext);
  const isAllOption = props.value != null && ALL_VALUES.has(String(props.value));
  React.useEffect(() => { if (isAllOption) markFilter?.(); }, [isAllOption, markFilter]);
  return (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-primary/10 focus:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-70',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
