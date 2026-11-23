import React, { useContext, useId, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, LogOut, UserCog } from 'lucide-react';
import SpaceHeaderIdentity, { SpaceHeaderContext } from '@/components/SpaceHeaderIdentity';
import SpaceHeaderProfile from '@/components/SpaceHeaderProfile';
import SpaceMobileHeader from '@/components/SpaceMobileHeader';
import EnablePushButton from '@/components/EnablePushButton';
import ErrorBoundary from '@/components/ErrorBoundary';
import ProductLogo from '@/components/ProductLogo';
import MobileTabBar from '@/components/mobile/MobileTabBar';
import SwipeTabs from '@/components/mobile/SwipeTabs';
import { Card, CardContent } from '@/components/ui/card';
import { useClient } from '@/hooks/useFeatureFlags';
import { PRODUCT_LOGO_URL, PRODUCT_NAME, isProductName } from '@/lib/clientConfig';
import { cn } from '@/lib/utils';

export function SpaceMenuItem({ label, icon, active, to, onClick, disabled }) {
  const props = {
    'aria-current': active ? 'page' : undefined,
    className: cn(
      'space-menu-item flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      active ? 'bg-primary/10 font-bold text-primary' : 'text-foreground/80 hover:bg-primary/10 hover:text-primary',
      'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
    ),
    children: (
      <>
        {React.isValidElement(icon) && React.cloneElement(icon, { className: 'h-4 w-4 shrink-0 text-primary', 'aria-hidden': true })}
        {label}
      </>
    ),
  };

  return to && !disabled
    ? <Link to={to} onClick={onClick} {...props} />
    : <button type="button" onClick={onClick} disabled={disabled} {...props} />;
}

function SpaceSidebarBrand({ label }) {
  const client = useClient();
  return (
    <Link to="/" className="space-sidebar-brand hidden min-w-0 items-center gap-3 px-3 md:flex" title={label}>
      <img src={client.logoUrl || PRODUCT_LOGO_URL} alt="" className="h-14 w-14 shrink-0 object-contain" />
      <span className="min-w-0">
        <span className="block truncate text-xl font-extrabold leading-tight text-foreground">{PRODUCT_NAME}</span>
        {client.displayName && !isProductName(client.displayName) && (
          <span className="mt-0.5 block truncate text-sm font-bold uppercase tracking-widest text-primary">
            {client.displayName}
          </span>
        )}
        <span className="mt-0.5 block truncate text-xs font-semibold text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}

const sidebarActionClass = 'flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

function SpaceSidebarActions({ onHome, onProfile, reader, onLogout }) {
  return (
    <>
    <ProductLogo decorative className="space-sidebar-logo mt-3 px-3 pb-1" imgClassName="w-40" />
    <div className="mt-2 flex items-center border-t border-border pt-1">
      <button type="button" onClick={onHome} className={sidebarActionClass}>
        <Home className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs font-semibold">Accueil</span>
      </button>
      <button type="button" onClick={onProfile} className={sidebarActionClass}>
        <UserCog className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs font-semibold">Profil</span>
      </button>
      {reader && <EnablePushButton reader={reader} asNavButton />}
      <button
        type="button"
        onClick={onLogout}
        aria-label="Déconnexion"
        className={cn(sidebarActionClass, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs font-semibold">Déconn.</span>
      </button>
    </div>
    </>
  );
}

/**
 * Structure des espaces authentifiés. La page sélectionne les destinations
 * accessibles et reste responsable des actions et du contenu métier.
 */
export default function SpaceShell({
  profile,
  menuOpen,
  onMenuOpenChange,
  menuItems,
  navigation,
  searchItems,
  mobileItems = menuItems,
  reader,
  onProfile,
  onLogout,
  sidebarNote,
  overlays,
  contentClassName,
  children,
}) {
  const navigate = useNavigate();
  const { spaceLabel = 'Mon espace' } = useContext(SpaceHeaderContext) || {};
  const menuId = useId();
  const activePage = menuItems.find((item) => item.active)?.key;
  const destinations = useMemo(
    () => searchItems ?? menuItems.filter((item) => !item.disabled),
    [searchItems, menuItems],
  );
  const selectItem = (item) => {
    if (item.disabled) return;
    onMenuOpenChange(false);
    if (item.to) navigate(item.to);
    else item.onClick?.();
  };
  const asMobileItems = (items) => items.map((item) => ({
    ...item,
    label: item.mobileLabel ?? item.label,
    onClick: () => selectItem(item),
  }));

  return (
    <div className="app-space-layout has-mobile-header flex flex-col gap-4 md:flex-row lg:gap-8">
      <SpaceMobileHeader
        {...profile}
        menuId={menuId}
        menuOpen={menuOpen}
        onToggleMenu={() => onMenuOpenChange(!menuOpen)}
      />
      <SpaceHeaderIdentity searchItems={destinations}>
        <SpaceHeaderProfile {...profile} />
      </SpaceHeaderIdentity>

      {menuOpen && (
        <div className="app-space-backdrop md:hidden" onClick={() => onMenuOpenChange(false)} aria-hidden="true" />
      )}
      <aside id={menuId} className={cn('app-space-sidebar md:w-72 md:shrink-0', menuOpen && 'is-open')}>
        <div className="app-space-sidebar-scroll sticky top-20 max-h-[calc(100vh-5.5rem)] space-y-3 overflow-y-auto pb-4 pr-1 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
          <Card className="space-sidebar-card">
            <SpaceSidebarBrand label={spaceLabel} />
            <CardContent className="p-3">
              <nav aria-label={`Menu · ${spaceLabel}`} className="space-y-1">
                {navigation ?? menuItems.map(({ key, ...item }) => (
                  <SpaceMenuItem
                    key={key}
                    {...item}
                    onClick={item.to ? () => onMenuOpenChange(false) : () => selectItem(item)}
                  />
                ))}
              </nav>
              <SpaceSidebarActions
                reader={reader}
                onHome={() => { onMenuOpenChange(false); navigate('/'); }}
                onProfile={() => { onMenuOpenChange(false); onProfile(); }}
                onLogout={onLogout}
              />
            </CardContent>
          </Card>
          {sidebarNote}
        </div>
      </aside>

      <div className={cn('app-space-main has-tabbar min-w-0 flex-1 overflow-visible', contentClassName)}>
        <SwipeTabs items={asMobileItems(menuItems)}>
          <ErrorBoundary key={activePage} where={[spaceLabel, activePage].filter(Boolean).join(' / ')}>
            {children}
          </ErrorBoundary>
        </SwipeTabs>
      </div>
      <MobileTabBar
        items={asMobileItems(mobileItems)}
        onMore={() => onMenuOpenChange(true)}
        moreActive={menuOpen}
        menuId={menuId}
      />
      {overlays}
    </div>
  );
}
