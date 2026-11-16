import React, { useRef, useState, useCallback } from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';
import { shouldIgnorePageGesture } from './touchGestures';

const THRESHOLD = 70;   // distance de déclenchement
const MAX_PULL = 96;    // amplitude visuelle max

/**
 * Tirer pour rafraîchir (mobile). N'engage le geste que si la page est en haut
 * et que le mouvement est vers le bas — pour ne pas gêner le défilement normal.
 *
 * @param {Function} onRefresh  async — appelé au-delà du seuil
 */
const PullToRefresh = ({ onRefresh, children }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const startX = useRef(null);
  const pullDistance = useRef(0);

  const cancelPull = () => {
    startY.current = null;
    pullDistance.current = 0;
    if (!refreshing) setPull(0);
  };

  const onTouchStart = useCallback((e) => {
    if (refreshing || e.touches.length !== 1 || !window.matchMedia('(max-width: 767px)').matches || shouldIgnorePageGesture(e.target, e.currentTarget, true)) {
      startY.current = null;
      return;
    }
    // window scroll ou conteneur ? on se base sur le scroll du document.
    const atTop = (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    startY.current = atTop ? e.touches[0].clientY : null;
    startX.current = e.touches[0].clientX;
    pullDistance.current = 0;
  }, [refreshing]);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 1) {
      startY.current = null;
      pullDistance.current = 0;
      if (!refreshing) setPull(0);
      return;
    }
    if (startY.current == null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    const dx = Math.abs(e.touches[0].clientX - startX.current);
    if (dx > 10 && dx > Math.abs(dy)) {
      startY.current = null;
      pullDistance.current = 0;
      setPull(0);
      return;
    }
    const atTop = (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    if (dy > 0 && atTop) {
      // résistance : on amortit le déplacement
      pullDistance.current = Math.min(dy * 0.5, MAX_PULL);
      setPull(pullDistance.current);
    } else {
      pullDistance.current = 0;
      setPull(0);
    }
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pullDistance.current >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      setPull(46);
      try { await onRefresh(); } catch { /* ignore */ }
      setRefreshing(false);
      setPull(0);
    } else {
      setPull(0);
    }
    pullDistance.current = 0;
  }, [onRefresh]);

  const ready = pull >= THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={cancelPull}
    >
      {/* Indicateur */}
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden text-primary"
        style={{ height: pull, opacity: pull > 4 ? 1 : 0, transition: refreshing ? 'height 0.2s ease' : (startY.current == null ? 'height 0.2s ease, opacity 0.2s ease' : 'none') }}
        aria-hidden={pull === 0}
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          {refreshing ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Actualisation…</>
          ) : ready ? (
            <><RefreshCw className="h-4 w-4" /> Relâchez pour actualiser</>
          ) : (
            <><ArrowDown className="h-4 w-4" /> Tirez pour actualiser</>
          )}
        </span>
      </div>

      <div
        style={{
          transform: `translateY(${refreshing ? 0 : Math.max(0, pull - 46) * 0.4}px)`,
          transition: startY.current == null ? 'transform 0.2s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
