
import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'app-dialog-overlay !fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Le viewport visuel suit aussi le clavier virtuel, contrairement à 100vh.
const ViewportDialogContent = React.forwardRef(({ style, ...props }, ref) => {
  const [viewport, setViewport] = React.useState({});
  React.useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return undefined;
    const update = () => setViewport({
      '--dialog-viewport-height': `${visualViewport.height}px`,
      '--dialog-viewport-top': `${visualViewport.offsetTop}px`,
    });
    update();
    visualViewport.addEventListener('resize', update);
    visualViewport.addEventListener('scroll', update);
    return () => {
      visualViewport.removeEventListener('resize', update);
      visualViewport.removeEventListener('scroll', update);
    };
  }, []);
  return <DialogPrimitive.Content ref={ref} data-app-dialog="" style={{ ...viewport, ...style }} {...props} />;
});
ViewportDialogContent.displayName = 'ViewportDialogContent';

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <ViewportDialogContent
      ref={ref}
      className={cn(
        'surface-glass !fixed left-[50%] top-[50%] z-50 grid max-h-[88vh] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="app-dialog-close absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-md bg-background/90 text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none sm:h-8 sm:w-8">
        <X className="h-4 w-4" />
        <span className="sr-only">Fermer</span>
      </DialogPrimitive.Close>
    </ViewportDialogContent>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn('flex flex-col space-y-1.5 pr-8 text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
