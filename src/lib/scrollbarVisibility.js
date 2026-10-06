const SCROLLING_CLASS = 'is-scrolling';
const HIDE_DELAY_MS = 800;

let initialized = false;

export function initAutoHideScrollbars() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;

  const hideTimers = new WeakMap();

  const getScrollElement = (target) => {
    if (
      target === document ||
      target === window ||
      target === document.body ||
      target === document.documentElement
    ) {
      return document.documentElement;
    }

    return target instanceof Element ? target : null;
  };

  const showScrollbar = (event) => {
    const element = getScrollElement(event.target);
    if (!element) return;

    element.classList.add(SCROLLING_CLASS);

    const previousTimer = hideTimers.get(element);
    if (previousTimer) window.clearTimeout(previousTimer);

    const timer = window.setTimeout(() => {
      element.classList.remove(SCROLLING_CLASS);
      hideTimers.delete(element);
    }, HIDE_DELAY_MS);

    hideTimers.set(element, timer);
  };

  document.addEventListener('scroll', showScrollbar, {
    capture: true,
    passive: true,
  });
  window.addEventListener('scroll', showScrollbar, { passive: true });
}
