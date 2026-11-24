// Version développement de jsx-runtime.js.
import { Fragment, jsxDEV as reactJsxDEV } from 'react/jsx-dev-runtime';
import { isTranslated, translateProps } from './translate';

export { Fragment };
export const jsxDEV = isTranslated
  ? (type, props, ...rest) => reactJsxDEV(type, translateProps(type, props), ...rest)
  : reactJsxDEV;
