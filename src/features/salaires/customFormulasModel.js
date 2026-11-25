// Formules de salaire personnalisées du client : liste { id, name, terms } de
// app_settings/custom_salary_formulas, partagée entre Paramètres et l'écran des salaires.
export const CUSTOM_FORMULAS_KEY = 'custom_salary_formulas';

const sameId = (a, b) => String(a) === String(b);

export const asFormulas = (value) => (Array.isArray(value) ? value : []).filter((formula) => formula?.id !== undefined && formula?.id !== null);

/** Ajoute la formule ou remplace celle de même identifiant ; les autres ne changent pas. */
export const upsertFormula = (formulas, { id, name, terms }) => {
  const formula = { id, name, terms: terms || [] };
  return formulas.some((item) => sameId(item.id, id))
    ? formulas.map((item) => (sameId(item.id, id) ? { ...item, ...formula } : item))
    : [...formulas, formula];
};

export const removeFormula = (formulas, id) => formulas.filter((item) => !sameId(item.id, id));
