import { recetteProblems } from './recette';

export default () => {
  const problems = recetteProblems();
  if (process.env.E2E_ISOLATED_ENV !== '1') problems.push('E2E_ISOLATED_ENV=1 requis');
  if (problems.length) throw new Error(`Base de recette non prête :\n- ${problems.join('\n- ')}`);
};
