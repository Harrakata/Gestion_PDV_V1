// Les contrôles et les zones défilables gardent la priorité sur les gestes de page.
export function shouldIgnorePageGesture(target, root, includeVerticalScroll = false) {
  if (!(target instanceof Element)) return true;
  if (target.closest('input, textarea, select, button, a, canvas, [contenteditable="true"], [role="slider"], [role="combobox"], [data-no-swipe]')) return true;
  let node = target;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 2) return true;
    if (includeVerticalScroll && /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return true;
    if (node === root) break;
    node = node.parentElement;
  }
  return false;
}
