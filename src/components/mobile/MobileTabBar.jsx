import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useMobileCustomization } from '@/lib/mobileCustomization';

/**
 * Barre d'onglets mobile (bottom tab bar) — visible uniquement sur téléphone.
 * Modèle hybride : 3-4 sections principales en onglets + un onglet « Plus »
 * qui ouvre le tiroir (profil, déconnexion, onglets secondaires). Si la page ouverte
 * vient du tiroir, elle prend la dernière place : la barre montre toujours où l'on est.
 *
 * @param {Array} items  [{ key, label, icon, active, onClick }]  (icon = élément lucide)
 * @param {Function} onMore  ouvre le tiroir
 * @param {boolean} moreActive
 * @param {string} [moreLabel]
 */
const MobileTabBar = ({ items = [], onMore, moreActive = false, moreLabel = 'Plus', menuId }) => {
  // 3 ou 4 raccourcis (Paramètres → App Mobile), puis le bouton « Plus ».
  const { tabCount } = useMobileCustomization();
  const tabs = items.slice(0, tabCount);
  const current = items.find((item) => item.active);
  if (current && !tabs.includes(current)) tabs[tabs.length - 1] = current;

  const renderIcon = (icon, active) =>
    React.isValidElement(icon)
      ? React.cloneElement(icon, { className: `h-5 w-5 ${active ? '' : 'opacity-90'}` })
      : null;

  return (
    <nav className="mobile-tabbar md:hidden" aria-label="Navigation principale">
      {tabs.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          disabled={item.disabled}
          aria-current={item.active ? 'page' : undefined}
          className={`mobile-tabbar-item ${item.active ? 'is-active' : ''}`}
        >
          {renderIcon(item.icon, item.active)}
          <span className="mobile-tabbar-label">{item.label}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={moreActive}
        aria-controls={menuId}
        aria-label="Ouvrir le menu de l’espace"
        className={`mobile-tabbar-item ${moreActive ? 'is-active' : ''}`}
      >
        <MoreHorizontal className="h-5 w-5" />
        <span className="mobile-tabbar-label">{moreLabel}</span>
      </button>
    </nav>
  );
};

export default MobileTabBar;
