import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Popover positionné manuellement (indépendant de Radix / floating-ui).
 * - Panneau rendu en `position: fixed` via un portail dans <body>.
 * - Position calculée depuis le bouton puis bornée au viewport (jamais hors écran).
 *
 * Peut être non-contrôlé (clic sur le trigger ouvre/ferme) ou contrôlé via `open`/`onOpenChange`.
 *
 * @param {React.ReactNode} trigger
 * @param {React.ReactNode} children
 * @param {'start'|'end'} [align='end']
 * @param {number} [width=256]            largeur du panneau (ignorée si matchTriggerWidth)
 * @param {boolean} [matchTriggerWidth]   le panneau prend la largeur du bouton
 * @param {string} [maxHeight='28rem']
 * @param {string} [panelClassName]
 * @param {boolean} [disabled]
 * @param {boolean} [open]                mode contrôlé
 * @param {(o:boolean)=>void} [onOpenChange]
 */
const AnchoredPopover = ({
  trigger, children, align = 'end', width = 256, matchTriggerWidth = false,
  maxHeight = '28rem', panelClassName = '', disabled = false, open: openProp, onOpenChange,
  triggerWrapClassName = 'inline-flex',
  onOpenAutoFocus,
}) => {
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = isControlled ? openProp : openState;
  const setOpen = (v) => {
    const next = typeof v === 'function' ? v(open) : v;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  };

  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const computePos = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 8;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportWidth = viewport?.width || window.innerWidth;
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const w = Math.min(matchTriggerWidth ? r.width : width, viewportWidth - margin * 2);
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(viewportLeft + margin, Math.min(left, viewportLeft + viewportWidth - w - margin));
    const below = Math.max(0, viewportBottom - r.bottom - margin - 4);
    const above = Math.max(0, r.top - viewportTop - margin - 4);
    const openAbove = below < 240 && above > below;
    setPos({
      top: openAbove ? undefined : Math.max(viewportTop + margin, Math.round(r.bottom + 4)),
      bottom: openAbove ? Math.max(margin, window.innerHeight - Math.round(r.top - 4)) : undefined,
      left: Math.round(left),
      width: Math.round(w),
      availableHeight: openAbove ? above : below,
    });
  };

  useLayoutEffect(() => {
    if (open) computePos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && pos) onOpenAutoFocus?.();
    // Une seule fois par ouverture, après le montage du panneau dans le portail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, Boolean(pos)]);

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => computePos();
    const onPointerDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.querySelector('button, [tabindex]')?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={triggerWrapClassName}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
      >
        {trigger}
      </span>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: `min(${maxHeight}, ${pos.availableHeight}px)`, zIndex: 90, pointerEvents: 'auto' }}
          className={`anchored-popover surface-glass overflow-y-auto overscroll-contain rounded-md border bg-popover text-popover-foreground shadow-md ${panelClassName}`}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  );
};

export default AnchoredPopover;
