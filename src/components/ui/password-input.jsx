import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Champ mot de passe uniforme avec contrôle d'affichage accessible. */
export const PasswordInput = React.forwardRef(({ className, visible, onVisibleChange, ...props }, ref) => {
  const [internalVisible, setInternalVisible] = React.useState(false);
  const isControlled = typeof visible === 'boolean';
  const isVisible = isControlled ? visible : internalVisible;

  const toggleVisibility = () => {
    const next = !isVisible;
    if (!isControlled) setInternalVisible(next);
    onVisibleChange?.(next);
  };

  return (
    <div className="password-field relative">
      <Input
        ref={ref}
        type={isVisible ? 'text' : 'password'}
        className={cn('pr-12', className)}
        {...props}
      />
      <button
        type="button"
        onClick={toggleVisibility}
        aria-label={isVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={isVisible}
        disabled={props.disabled}
        className="absolute right-0 inset-y-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        {isVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;

