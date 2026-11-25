// Journal de navigation : évènements enregistrés un par un, regroupés, ou pas du tout, selon le
// mode de ressources (module sans dépendance, testé par tests/unit/resourceMode.test.js).

/**
 * @param {boolean}  log       faux : rien n'est enregistré
 * @param {number}   groupFor  délai de regroupement (ms) ; 0 : enregistrement immédiat
 * @param {Function} save      (évènements) → enregistre
 */
export const createNavigationLog = ({ log, groupFor, save }) => {
  let events = [];
  let timer = null;

  /** Retire et renvoie ce qui n'est pas encore enregistré. */
  const take = () => {
    clearTimeout(timer);
    timer = null;
    const taken = events;
    events = [];
    return taken;
  };
  const flush = () => {
    const taken = take();
    if (taken.length) save(taken);
  };

  return {
    take,
    flush,
    add(event) {
      if (!log) return;
      if (!groupFor) { save([event]); return; }
      events.push({ ...event, at: new Date().toISOString() });
      if (!timer) timer = setTimeout(flush, groupFor);
    },
  };
};
