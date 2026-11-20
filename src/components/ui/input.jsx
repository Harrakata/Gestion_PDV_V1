
import React from 'react';
import { cn } from '@/lib/utils';

// placeholder « » par défaut : permet au CSS (:placeholder-shown) de savoir si le
// champ est vide, pour n'afficher que son libellé tant qu'il n'est pas rempli.
const Input = React.forwardRef(({ className, type, placeholder = ' ', ...props }, ref) => {
  return (
    <input
      type={type}
      placeholder={placeholder}
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-soft ring-offset-background transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
