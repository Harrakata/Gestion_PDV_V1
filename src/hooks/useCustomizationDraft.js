import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadAppSetting, saveAppSetting } from '@/lib/appSettings';

/**
 * Brouillon de personnalisation : chaque changement est appliqué en APERÇU (rien
 * n'est mémorisé) ; seul `save` l'enregistre pour tous les utilisateurs. Quitter la
 * page sans enregistrer rétablit les réglages enregistrés.
 *
 * @param {object} p
 * @param {string} p.settingKey            clé `app_settings`
 * @param {(value: any) => object} p.normalize
 * @param {(value: object, options: { persist: boolean }) => void} p.apply
 * @param {(value: object) => object} [p.serialize]  valeur écrite en base
 */
export function useCustomizationDraft({ settingKey, normalize, apply, serialize = (value) => value }) {
  const [saved, setSaved] = useState(() => normalize());
  const [draft, setDraft] = useState(saved);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const latest = useRef({ saved, draft });
  latest.current = { saved, draft };

  const dirtyKeys = useMemo(
    () => Object.keys(draft).filter((key) => draft[key] !== saved[key]),
    [draft, saved],
  );
  const isDirty = dirtyKeys.length > 0;

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    loadAppSetting(settingKey)
      .then((value) => {
        if (!active) return;
        const next = normalize(value);
        setSaved(next);
        setDraft(next);
        setIsLoaded(true);
      })
      // Réglages inconnus : on n'autorise ni modification ni enregistrement, qui
      // remplaceraient ceux du client par les valeurs par défaut.
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [settingKey, normalize, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Départ sans enregistrer : on retire l'aperçu.
  useEffect(() => () => {
    const { saved: kept, draft: shown } = latest.current;
    if (Object.keys(shown).some((key) => shown[key] !== kept[key])) apply(kept, { persist: false });
  }, [apply]);

  const replace = useCallback((value) => {
    const next = normalize(value);
    setDraft(next);
    apply(next, { persist: false });
  }, [normalize, apply]);

  const update = useCallback((patch) => replace({ ...latest.current.draft, ...patch }), [replace]);
  const cancel = useCallback(() => replace(latest.current.saved), [replace]);
  const reset = useCallback(() => replace(undefined), [replace]);

  const save = useCallback(async () => {
    const value = latest.current.draft;
    setIsSaving(true);
    try {
      await saveAppSetting(settingKey, serialize(value));
      apply(value, { persist: true });
      setSaved(value);
    } finally {
      setIsSaving(false);
    }
  }, [settingKey, serialize, apply]);

  return { draft, saved, isLoaded, loadFailed, retry, isSaving, isDirty, dirtyKeys, update, replace, cancel, reset, save };
}

export default useCustomizationDraft;
