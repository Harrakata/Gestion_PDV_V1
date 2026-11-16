/** Messages de saisie partagés ; les contrôles métier restent dans chaque page. */
export function validatePersonnelFields(data, { requiredFields, passwordField, passwordRequired }) {
  const errors = {};
  for (const field of requiredFields) {
    if (!String(data[field] ?? '').trim()) errors[field] = 'Ce champ est obligatoire.';
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Saisissez une adresse email valide.';
  }
  const password = String(data[passwordField] || '');
  if ((passwordRequired || password) && password.length < 8) {
    errors[passwordField] = 'Saisissez au moins 8 caractères.';
  }
  return errors;
}
