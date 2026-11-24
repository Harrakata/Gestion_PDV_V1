import React from 'react';
import { LANGUAGES, getUserLanguage, setUserLanguage } from '@/i18n/language';
import { ThemeSegmented } from '@/components/parametres/SettingControls';

const FOLLOW = 'client';
const OPTIONS = [{ value: FOLLOW, label: "Langue de l'application" }, ...LANGUAGES];

/** Choix personnel de la langue, sur cet appareil (la page se recharge si la langue change). */
export default function PersonalLanguagePicker() {
  const [value, setValue] = React.useState(() => getUserLanguage() || FOLLOW);
  const handleChange = (next) => {
    setValue(next);
    setUserLanguage(next === FOLLOW ? null : next);
  };
  return <ThemeSegmented ariaLabel="Langue sur cet appareil" options={OPTIONS} value={value} onChange={handleChange} />;
}
