import { PRODUCT_NAME, productHomeLogo } from '@/lib/clientConfig';
import { cn } from '@/lib/utils';

// Le logo du thème inactif est en display: none : il n'est ni affiché ni lu.
const THEMES = [['light', 'dark:hidden'], ['dark', 'hidden dark:block']];
const SIZES = { wide: [1200, 334], tall: [720, 608] };

/**
 * Logo GPDV détouré, adapté au thème clair/sombre.
 * @param {'wide'|'tall'|'auto'} p.shape  auto = vertical sur téléphone, horizontal ensuite
 * @param {string} p.imgClassName        largeur de l'image
 */
const ProductLogo = ({ shape = 'wide', className, imgClassName, decorative = false }) => {
  const base = shape === 'auto' ? 'tall' : shape;
  return (
    <span className={cn('product-logo flex justify-center', className)}>
      {THEMES.map(([theme, visibility]) => (
        <picture key={theme} data-logo-theme={theme} className={visibility}>
          {shape === 'auto' && <source media="(min-width: 640px)" srcSet={productHomeLogo('wide', theme)} width={SIZES.wide[0]} height={SIZES.wide[1]} />}
          <img
            src={productHomeLogo(base, theme)}
            alt={decorative ? '' : `${PRODUCT_NAME} — Gestion des points de vente`}
            width={SIZES[base][0]}
            height={SIZES[base][1]}
            className={cn('h-auto', imgClassName)}
          />
        </picture>
      ))}
    </span>
  );
};

export default ProductLogo;
