import { cn } from '@/lib/utils';

/** Zone d'actions cohérente pour formulaires et dialogues. */
export function FormActions({ children, sticky = false, className }) {
  return (
    <div data-dialog-actions="" className={cn(
      'flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end',
      sticky && 'sticky bottom-0 z-10 -mx-4 bg-background/95 px-4 pb-3 backdrop-blur',
      className,
    )}>
      {children}
    </div>
  );
}

export default FormActions;

