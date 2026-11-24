// Moteur JSX de l'application (branché par vite.config.js) : celui de React, plus la
// traduction. En français, ce sont exactement les fonctions de React.
import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime';
import { isTranslated, translateProps } from './translate';

export { Fragment };
export const jsx = isTranslated ? (type, props, key) => reactJsx(type, translateProps(type, props), key) : reactJsx;
export const jsxs = isTranslated ? (type, props, key) => reactJsxs(type, translateProps(type, props), key) : reactJsxs;
