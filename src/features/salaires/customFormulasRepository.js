import { CUSTOM_FORMULAS_KEY, asFormulas, removeFormula, upsertFormula } from './customFormulasModel.js';

// Le client est fourni par l'appelant. Chaque changement part de la liste en base, relue juste
// avant : enregistrer une formule ne peut ni effacer ni rétablir les autres.
const read = async (client) => {
  const { data, error } = await client.from('app_settings').select('id, value').eq('key', CUSTOM_FORMULAS_KEY).limit(1);
  if (error) throw error;
  return { exists: Boolean(data?.length), formulas: asFormulas(data?.[0]?.value) };
};

const change = async (client, transform) => {
  const { exists, formulas } = await read(client);
  const value = transform(formulas);
  const { error } = exists
    ? await client.from('app_settings').update({ value }).eq('key', CUSTOM_FORMULAS_KEY)
    : await client.from('app_settings').insert({ key: CUSTOM_FORMULAS_KEY, value });
  if (error) throw error;
  return value;
};

export const fetchCustomFormulas = async (client) => (await read(client)).formulas;
export const saveCustomFormula = (client, formula) => change(client, (formulas) => upsertFormula(formulas, formula));
export const deleteCustomFormula = (client, id) => change(client, (formulas) => removeFormula(formulas, id));
