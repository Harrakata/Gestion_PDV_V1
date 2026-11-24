// Remplace 'date-fns/locale' (vite.config.js) : `fr` suit la langue de l'application.
import frLocale from 'date-fns/locale/fr';
import enLocale from 'date-fns/locale/en-GB';
import { isEnglish } from './language';

export const fr = isEnglish ? enLocale : frLocale;
