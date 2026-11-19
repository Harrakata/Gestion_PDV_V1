
import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import OfflineSyncIndicator from '@/components/OfflineSyncIndicator';
import { SpaceHeaderContext } from '@/components/SpaceHeaderIdentity';
import SpaceHeaderSearch from '@/components/SpaceHeaderSearch';
const FloatingAssistant = React.lazy(() => import('@/components/assistant/FloatingAssistant'));
import { Home, Briefcase, Users, Settings, BarChart3, LogIn, Sun, Moon, Menu, Wrench, ShieldCheck, Wallet, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { useClient, useSecteurEnabled } from '@/hooks/useFeatureFlags';
import { useGlobalNotificationWatcher } from '@/hooks/useSpaceNotifications';
import { loadNotificationSettings } from '@/lib/notificationSettings';
import { supabase } from '@/lib/supabaseClient';
import {
  APP_SPACE_SETTINGS_KEY,
  buildDefaultAppSpaceFunctionalities,
  getAppSpaceFeatureForPathname,
  normalizeAppSpaceFunctionalities,
} from '@/lib/exploitationProfiles';
import { buildBreadcrumbs } from '@/lib/navigationConfig';

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const client = useClient();
  const secteurEnabled = useSecteurEnabled();
  const [profileTarget, setProfileTarget] = React.useState(null);
  const [connectedSpaceCount, setConnectedSpaceCount] = React.useState(0);
  const registerSpace = React.useCallback((delta) => setConnectedSpaceCount(count => count + delta), []);
  const connectedSpace = connectedSpaceCount > 0 && location.pathname.startsWith('/espace-');
  const [spaceSearchItems, setSpaceSearchItems] = React.useState(null);
  const headerContext = React.useMemo(
    () => ({ target: profileTarget, register: registerSpace, searchItems: spaceSearchItems, setSearchItems: setSpaceSearchItems }),
    [profileTarget, registerSpace, spaceSearchItems]
  );
  // Surveillance globale des notifications : continue de déclencher les notifs OS même
  // hors de l'espace concerné (accueil, autre espace, onglet en arrière-plan) tant que
  // l'app tourne. App totalement fermée = Web Push requis (VITE_VAPID_PUBLIC_KEY).
  useGlobalNotificationWatcher();

  // Réglages globaux des notifications (activer/désactiver par type) → cache localStorage
  // lu par le pipeline de notifications. Rechargé au boot + sur mise à jour.
  React.useEffect(() => {
    loadNotificationSettings();
    const onUpdate = () => loadNotificationSettings();
    window.addEventListener('app-notification-settings-updated', onUpdate);
    return () => window.removeEventListener('app-notification-settings-updated', onUpdate);
  }, []);

  // Auto-configuration de l'endpoint des rappels (cron serveur) à partir des variables
  // d'env par-client — rend la migration SQL 100% générique (aucune valeur en dur).
  // Idempotent, au plus une fois/jour.
  React.useEffect(() => {
    try {
      const last = Number(localStorage.getItem('reminder_endpoint_synced') || 0);
      if (Date.now() - last < 86400000) return;
      const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!base || !key) return;
      supabase.rpc('set_reminder_endpoint', { fn_url: `${base}/functions/v1/send-reminders`, api_key: key })
        .then(() => { try { localStorage.setItem('reminder_endpoint_synced', String(Date.now())); } catch { /* quota */ } })
        .catch(() => { /* best-effort */ });
    } catch { /* ignore */ }
  }, []);
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    // Lire le mode sombre depuis le cache thème pour éviter un flash au rechargement
    try {
      const cached = localStorage.getItem('app_theme_cache');
      if (cached) return Boolean(JSON.parse(cached).darkMode);
    } catch { /* ignore */ }
    return document.documentElement.classList.contains('dark');
  });
  const [spaceFunctionalities, setSpaceFunctionalities] = React.useState(() => {
    try {
      return normalizeAppSpaceFunctionalities(
        JSON.parse(window.localStorage.getItem(APP_SPACE_SETTINGS_KEY) || '{}')
      );
    } catch (error) {
      return buildDefaultAppSpaceFunctionalities();
    }
  });
  const [hasLoadedSpaceFunctionalities, setHasLoadedSpaceFunctionalities] = React.useState(false);

  React.useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  React.useEffect(() => {
    const loadSpaceFunctionalities = async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', APP_SPACE_SETTINGS_KEY)
        .single();

      if (!error && data?.value) {
        const normalizedSettings = normalizeAppSpaceFunctionalities(data.value);
        setSpaceFunctionalities(normalizedSettings);
        window.localStorage.setItem(APP_SPACE_SETTINGS_KEY, JSON.stringify(normalizedSettings));
        window.dispatchEvent(
          new CustomEvent('app-functionalities-updated', {
            detail: normalizedSettings,
          })
        );
      } else if (error && error.code !== 'PGRST116') {
        console.error('Erreur chargement fonctionnalités espaces :', error);
      } else {
        const normalizedSettings = buildDefaultAppSpaceFunctionalities();
        setSpaceFunctionalities(normalizedSettings);
        window.localStorage.setItem(APP_SPACE_SETTINGS_KEY, JSON.stringify(normalizedSettings));
      }

      setHasLoadedSpaceFunctionalities(true);
    };

    loadSpaceFunctionalities();
  }, []);

  React.useEffect(() => {
    const handleFunctionalitiesUpdated = (event) => {
      const normalizedSettings = normalizeAppSpaceFunctionalities(event.detail);
      setSpaceFunctionalities(normalizedSettings);
      window.localStorage.setItem(APP_SPACE_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    };

    window.addEventListener('app-functionalities-updated', handleFunctionalitiesUpdated);
    return () => window.removeEventListener('app-functionalities-updated', handleFunctionalitiesUpdated);
  }, []);

  const navLinks = [
    { to: '/', label: "Page d'Accueil", icon: <Home className="mr-2 h-4 w-4" /> },
    { to: '/pointage', label: 'Pointage', icon: <LogIn className="mr-2 h-4 w-4" />, featureKey: 'pointage' },
    {
      to: '/paiement-gros-gain',
      label: 'Paiement Gros Gain',
      icon: <Wallet className="mr-2 h-4 w-4" />,
      featureKey: 'paiement-gros-gain',
    },
  ];

  const dropdownLinks = [
      { to: '/espace-exploitation', label: 'Espace Exploitation', icon: <Briefcase className="mr-2 h-4 w-4" /> },
      { to: '/espace-chef-agence', label: "Espace Chef d'agence", icon: <Users className="mr-2 h-4 w-4" />, featureKey: 'espace-chef-agence' },
      { to: '/espace-chef-secteur', label: 'Espace Chef de secteur', icon: <Users className="mr-2 h-4 w-4" />, featureKey: 'espace-chef-secteur', requiresSecteur: true },
      { to: '/espace-guichetiere', label: 'Espace Guichetière', icon: <User className="mr-2 h-4 w-4" />, featureKey: 'espace-guichetiere' },
      { to: '/espace-validation-paiement-gain', label: 'Espace Directeur régional', icon: <ShieldCheck className="mr-2 h-4 w-4" />, featureKey: 'espace-directeur-regional' },
      { to: '/espace-directeur-general', label: 'Espace Directeur général', icon: <ShieldCheck className="mr-2 h-4 w-4" />, featureKey: 'espace-directeur-general' },
      { to: '/espace-technicien', label: 'Espace Technicien', icon: <Wrench className="mr-2 h-4 w-4" />, featureKey: 'espace-technicien' },
  ];

  const availableDropdownLinks = dropdownLinks.filter(
    (link) => (!link.featureKey || spaceFunctionalities[link.featureKey] !== false)
      && (!link.requiresSecteur || secteurEnabled)
  );
  const availableNavLinks = navLinks.filter(
    (link) => !link.featureKey || spaceFunctionalities[link.featureKey] !== false
  );

  const isSpaceRouteActive = availableDropdownLinks.some((link) => location.pathname.startsWith(link.to));
  const activeSpaceLabel = dropdownLinks.find((link) => location.pathname.startsWith(link.to))?.label || 'Mon espace';

  React.useEffect(() => {
    const crumbs = buildBreadcrumbs(location.pathname);
    const currentLabel = crumbs.at(-1)?.label;
    document.title = currentLabel && currentLabel !== 'Accueil'
      ? `${currentLabel} · ${client.displayName || 'GestionPDV'}`
      : client.displayName || 'GestionPDV';
  }, [client.displayName, location.pathname]);

  React.useEffect(() => {
    // Structure : niveau secteur désactivé → l'espace chef de secteur est inaccessible.
    if (!secteurEnabled && location.pathname.startsWith('/espace-chef-secteur')) {
      navigate('/', { replace: true });
      return;
    }

    if (!hasLoadedSpaceFunctionalities) return;

    const matchedFeature = getAppSpaceFeatureForPathname(location.pathname);
    if (!matchedFeature) return;

    if (spaceFunctionalities[matchedFeature.key] === false) {
      toast({
        title: 'Espace désactivé',
        description: `${matchedFeature.label} est actuellement désactivé depuis Profil et Fonctionnalité.`,
        variant: 'destructive',
      });
      navigate('/', { replace: true });
    }
  }, [hasLoadedSpaceFunctionalities, location.pathname, navigate, secteurEnabled, spaceFunctionalities, toast]);

  return (
    <SpaceHeaderContext.Provider value={headerContext}>
    <div
      className={`flex min-h-screen flex-col transition-colors ${connectedSpace ? 'connected-space-shell' : ''} ${
        location.pathname.startsWith('/espace-exploitation')
          ? 'exploitation-theme-surface'
          : location.pathname.startsWith('/espace-')
            ? 'other-spaces-theme-surface'
          : 'app-page-theme-surface'
      }`}
    >
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-floating transition-transform focus:translate-y-0"
      >
        Aller au contenu principal
      </a>
      <header className="app-top-header sticky top-0 z-40 w-full border-b border-border bg-background/95 shadow-soft backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="flex h-14 w-full items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
          <Link to="/" className="space-brand-anchor flex min-w-0 items-center gap-3 group">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <img
                src={client.logoUrl || "/carrus-logo.png"}
                alt={client.displayName || "CARRUS Betting Solutions & Services"}
                className="h-10 w-auto object-contain drop-shadow-sm sm:h-12"
              />
            </motion.div>
            {connectedSpace && (
              <span className="space-brand-copy hidden min-w-0 md:block" title={activeSpaceLabel}>
                <span className="block truncate text-base font-extrabold leading-tight text-foreground">
                  Gestion PDV
                </span>
                <span className="mt-0.5 block truncate text-[0.7rem] font-bold uppercase tracking-[0.12em] text-primary">
                  {client.displayName || 'GestionPDV'}
                </span>
              </span>
            )}
          </Link>

          <div className={connectedSpace ? 'space-header-bar hidden min-w-0 flex-1 items-center gap-4 md:flex' : 'hidden'}>
            {connectedSpace && (
              <SpaceHeaderSearch
                items={spaceSearchItems}
                enableDataSearch={location.pathname.startsWith('/espace-exploitation')}
              />
            )}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <OfflineSyncIndicator enabled={spaceFunctionalities.offline_mode === true} />
              <span className="space-header-actions flex shrink-0 items-center">
                <button type="button" onClick={toggleTheme}
                  aria-label={isDarkMode ? 'Activer le thème clair' : 'Activer le thème sombre'}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </span>
              <div ref={setProfileTarget} className="min-w-0" />
            </div>
          </div>
          {!connectedSpace && <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
            <div className="flex items-center gap-1">
              {availableNavLinks.map(link => {
                const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
                return (
                  <button
                    type="button"
                    key={link.to}
                    onClick={() => navigate(link.to)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isActive
                        ? 'text-primary after:absolute after:inset-x-3 after:top-0 after:h-1.5 after:rounded-full after:bg-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>
                      {React.cloneElement(link.icon, { className: 'h-3.5 w-3.5' })}
                    </span>
                    {link.label}
                  </button>
                );
              })}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-current={isSpaceRouteActive ? 'page' : undefined}
                    className={`relative inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      isSpaceRouteActive
                        ? 'text-primary after:absolute after:inset-x-3 after:top-0 after:h-1.5 after:rounded-full after:bg-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <span className={isSpaceRouteActive ? 'text-primary' : 'text-muted-foreground'}>
                      <Menu className="h-3.5 w-3.5" />
                    </span>
                    Espaces
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 overflow-hidden border-border bg-popover p-1 shadow-floating">
                  <div>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Menu className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">Navigation principale</span>
                    </div>
                    <div className="mx-2 mb-1 h-px bg-border" />
                    <div className="space-y-0.5 px-2 pb-2">
                      {availableDropdownLinks.map(link => {
                        const isActive = location.pathname.startsWith(link.to);
                        return (
                          <DropdownMenuItem
                            key={link.to}
                            onClick={() => navigate(link.to)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                            }`}
                          >
                            {link.icon}
                            {link.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <OfflineSyncIndicator enabled={spaceFunctionalities.offline_mode === true} />
              <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDarkMode ? 'Activer le thème clair' : 'Activer le thème sombre'}
                title={isDarkMode ? 'Thème clair' : 'Thème sombre'}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </nav>}
          
          <div className="md:hidden flex items-center gap-2">
            <OfflineSyncIndicator enabled={spaceFunctionalities.offline_mode === true} />
            <button
              onClick={toggleTheme}
              aria-label="Changer de thème"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Ouvrir le menu" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <Menu className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 overflow-hidden border-border bg-popover p-1 shadow-floating">
                <div>
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Menu className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Menu</span>
                  </div>
                  <div className="mx-2 mb-1 h-px bg-border" />
                  <div className="space-y-0.5 px-2 pb-1">
                    {availableNavLinks.map(link => {
                      const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
                      return (
                        <DropdownMenuItem key={link.to} onClick={() => navigate(link.to)}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${isActive ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted hover:text-foreground'}`}
                        >
                          {link.icon}{link.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                  <div className="mx-2 my-1 h-px bg-border" />
                  <div className="px-3 pb-1 pt-0.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espaces</p>
                  </div>
                  <div className="space-y-0.5 px-2 pb-2">
                    {availableDropdownLinks.map(link => {
                      const isActive = location.pathname.startsWith(link.to);
                      return (
                        <DropdownMenuItem key={link.to} onClick={() => navigate(link.to)}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${isActive ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted hover:text-foreground'}`}
                        >
                          {link.icon}{link.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 container min-w-0 px-3 py-4 outline-none sm:px-4 sm:py-6 lg:px-6 lg:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border py-5 md:px-8">
        <div className="container flex items-center justify-center">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            © {new Date().getFullYear()} {client.displayName || 'GestionPDV'}. Tous droits réservés.
          </p>
        </div>
      </footer>
      <React.Suspense fallback={null}><FloatingAssistant /></React.Suspense>
    </div>
    </SpaceHeaderContext.Provider>
  );
};

export default Layout;
