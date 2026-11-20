import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { describeError } from '@/lib/errors';
import SpaceHeaderIdentity from '@/components/SpaceHeaderIdentity';
import SpaceHeaderProfile from '@/components/SpaceHeaderProfile';
import SpaceMobileHeader from '@/components/SpaceMobileHeader';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wrench, Loader2, LogOut, CalendarDays, AtSign, UserCog, Menu, X, Home, CalendarOff, Ticket } from 'lucide-react';
import EditProfileDialog from '@/components/EditProfileDialog';
import ForgotPasswordDialog from '@/components/ForgotPasswordDialog';
import SpaceLoginCard from '@/components/SpaceLoginCard';
import NotificationBell from '@/components/NotificationBell';
import { useSpaceNotifications, clearNotifWatch } from '@/hooks/useSpaceNotifications';
import MobileTabBar from '@/components/mobile/MobileTabBar';
import PullToRefresh from '@/components/mobile/PullToRefresh';
import SwipeTabs from '@/components/mobile/SwipeTabs';
import { useFeature } from '@/hooks/useFeatureFlags';
import { useSyncHealthHeartbeat } from '@/hooks/useSyncHealthHeartbeat';
import RemonteeDialog from '@/components/RemonteeDialog';
import EnablePushButton from '@/components/EnablePushButton';
import NotifEnableBanner from '@/components/NotifEnableBanner';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import {
  APP_SPACE_TAB_SETTINGS_KEY,
  APP_SPACE_USER_PROFILES_SETTINGS_KEY,
  buildDefaultAppSpaceTabFunctionalities,
  buildDefaultAppSpaceUserProfiles,
  canAccessAppSpaceUserTab,
  getFirstEnabledAppSpaceTab,
  getEffectiveAppSpaceUserProfile,
  isAppSpaceTabEnabled,
  normalizeAppSpaceTabFunctionalities,
  normalizeAppSpaceUserProfiles,
} from '@/lib/exploitationProfiles';
import { smartSignIn, fetchAuthLinkedProfile, fetchOrLinkAuthProfile } from '@/lib/smartAuth';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

// Code-split : ces composants lourds (formulaire de maintenance + signature,
// onglets de réparation, date-fns…) ne sont téléchargés qu'une fois le
// technicien authentifié, et non au premier rendu de l'écran de connexion.
const MaintenanceTab = lazy(() => import('@/pages/maintenance/MaintenanceTab'));
const MonPlanningMaintenancePage = lazy(() => import('@/pages/technicien/MonPlanningMaintenancePage'));
const AbsenceRequestsPanel = lazy(() => import('@/components/absences/AbsenceRequestsPanel'));
const TicketsPanel = lazy(() => import('@/components/tickets/TicketsPanel'));
const ABSENCE_ROLE_TECHNICIEN = 'technicien';

const SectionLoader = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const loadSpaceUserProfilesSettings = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', APP_SPACE_USER_PROFILES_SETTINGS_KEY)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return normalizeAppSpaceUserProfiles(data?.value);
};

const LoginPage = ({ onLogin }) => {
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
      return;
    }
    setIsLoading(true);

    // 1) Auth Supabase (smart : accepte email ou matricule)
    const tAuth = performance.now();
    const { data: authData, error: authErr } = await smartSignIn({
      identifier, password, table: 'techniciens',
    });
    console.info(`[perf] signInWithPassword: ${Math.round(performance.now() - tAuth)} ms`);
    if (authErr || !authData?.user) {
      toast({
        title: 'Connexion échouée',
        description: authErr?.message?.includes('Invalid login credentials')
          ? 'Identifiant ou mot de passe incorrect.'
          : (authErr?.message ?? 'Identifiant ou mot de passe incorrect.'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    // 2) Récupérer le profil technicien lié à ce compte auth
    const tProfile = performance.now();
    const { data: profile, error: profileErr } = await fetchOrLinkAuthProfile({
      table: 'techniciens',
      authUserId: authData.user.id,
      identifier,
      authEmail: authData.user.email,
    });
    console.info(`[perf] fetchAuthLinkedProfile: ${Math.round(performance.now() - tProfile)} ms`);
    if (profileErr || !profile) {
      await supabase.auth.signOut();
      toast({
        title: 'Aucun profil technicien associé',
        description: describeError(profileErr, 'EspaceMaintenancePage', 'Votre compte n\'est lié à aucune fiche technicien. Contactez un administrateur.'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const profileSettings = await loadSpaceUserProfilesSettings().catch(() => buildDefaultAppSpaceUserProfiles());
    const effectiveProfile = getEffectiveAppSpaceUserProfile(profileSettings, 'espace-technicien', profile.id);
    if (effectiveProfile.statut !== 'Actif') {
      await supabase.auth.signOut();
      toast({
        title: 'Compte désactivé',
        description: 'Votre profil Technicien est désactivé. Contactez un administrateur.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    onLogin(true, { ...profile, appSpaceProfile: effectiveProfile });
    toast({
      title: 'Connexion réussie',
      description: `Bienvenue ${profile.prenom} ${profile.nom}`,
      className: 'bg-success text-white',
    });
    setIsLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <SpaceLoginCard
        title="Espace Technicien"
        description="Connectez-vous avec votre email ou votre matricule."
        icon={<Wrench />}
        identifier={identifier}
        onIdentifierChange={setIdentifier}
        password={password}
        onPasswordChange={setPassword}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        onForgotPassword={() => setIsForgotOpen(true)}
      />
      <ForgotPasswordDialog open={isForgotOpen} onOpenChange={setIsForgotOpen} defaultEmail={identifier.includes('@') ? identifier : ''} />
    </motion.div>
  );
};

const EspaceMaintenancePage = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [activeSection, setActiveSection] = useState('maintenance');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handlePullRefresh = async () => { setRefreshKey((k) => k + 1); await new Promise((r) => setTimeout(r, 500)); };
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [spaceTabFunctionalities, setSpaceTabFunctionalities] = useState(() => {
    try {
      return normalizeAppSpaceTabFunctionalities(
        JSON.parse(localStorage.getItem(APP_SPACE_TAB_SETTINGS_KEY) || '{}')
      );
    } catch (error) {
      return buildDefaultAppSpaceTabFunctionalities();
    }
  });
  const [spaceUserProfiles, setSpaceUserProfiles] = useState(() => {
    try {
      return normalizeAppSpaceUserProfiles(
        JSON.parse(localStorage.getItem(APP_SPACE_USER_PROFILES_SETTINGS_KEY) || '{}')
      );
    } catch (error) {
      return buildDefaultAppSpaceUserProfiles();
    }
  });

  useActivityTracker({
    spaceKey: 'espace-technicien',
    isAuthenticated,
    identity: userData,
  });

  // Déconnexion automatique après inactivité (durée : Paramètres > session).
  useSessionTimeout(null, () => handleLogout(), 'pmuTechnicienAuth', { enabled: isAuthenticated });

  const { notifications: technicienNotifications, totalCount: technicienNotifCount } = useSpaceNotifications({
    spaceKey: 'espace-technicien',
    enabled: isAuthenticated,
    context: { technicienId: userData?.id },
  });

  // Acquitte les interventions refusées (hors zone) une fois le technicien dans son espace.
  useEffect(() => {
    const tid = userData?.id;
    if (!isAuthenticated || !tid) return;
    supabase.from('interventions_maintenance')
      .update({ geo_refusal_ack: true })
      .eq('technicien_id', tid)
      .eq('geo_refused', true)
      .not('geo_refusal_ack', 'is', true)
      .then(() => {}, () => {});
  }, [isAuthenticated, userData?.id]);

  // Restauration de la session : si l'utilisateur a déjà un JWT Supabase valide,
  // on re-fetch son profil technicien sans demander de re-login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.user) {
        const { data: profile } = await fetchAuthLinkedProfile({
          table: 'techniciens', authUserId: session.user.id,
        });
        if (!cancelled && profile) {
          const profileSettings = await loadSpaceUserProfilesSettings().catch(() => buildDefaultAppSpaceUserProfiles());
          const effectiveProfile = getEffectiveAppSpaceUserProfile(profileSettings, 'espace-technicien', profile.id);
          if (effectiveProfile.statut !== 'Actif') {
            await supabase.auth.signOut();
          } else if (!cancelled) {
            setSpaceUserProfiles(profileSettings);
            localStorage.setItem(APP_SPACE_USER_PROFILES_SETTINGS_KEY, JSON.stringify(profileSettings));
            setUserData({ ...profile, appSpaceProfile: effectiveProfile });
            setIsAuthenticated(true);
          }
        } else if (!cancelled) {
          await supabase.auth.signOut();
        }
      }
      if (!cancelled) setIsCheckingSession(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (status, data) => {
    setIsAuthenticated(status);
    setUserData(data);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Nettoyage des anciens vestiges localStorage (migration douce)
    clearNotifWatch('espace-technicien');
    try { localStorage.removeItem('pmuTechnicienAuth'); } catch {}
    setIsAuthenticated(false);
    setUserData(null);
    navigate('/');
  };

  useEffect(() => {
    const handleSpaceTabsUpdated = (event) => {
      const normalizedSettings = normalizeAppSpaceTabFunctionalities(event.detail);
      setSpaceTabFunctionalities(normalizedSettings);
      localStorage.setItem(APP_SPACE_TAB_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    };

    window.addEventListener('app-space-tabs-updated', handleSpaceTabsUpdated);
    return () => window.removeEventListener('app-space-tabs-updated', handleSpaceTabsUpdated);
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const normalizedSettings = await loadSpaceUserProfilesSettings().catch(() => buildDefaultAppSpaceUserProfiles());
      setSpaceUserProfiles(normalizedSettings);
      localStorage.setItem(APP_SPACE_USER_PROFILES_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const handleSpaceUserProfilesUpdated = (event) => {
      const normalizedSettings = normalizeAppSpaceUserProfiles(event.detail);
      setSpaceUserProfiles(normalizedSettings);
      localStorage.setItem(APP_SPACE_USER_PROFILES_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    };

    window.addEventListener('app-space-user-profiles-updated', handleSpaceUserProfilesUpdated);
    return () => window.removeEventListener('app-space-user-profiles-updated', handleSpaceUserProfilesUpdated);
  }, []);

  // Activation globale des fonctionnalités (kill-switch « Profil et Fonctionnalité »).
  const moduleFeatureEnabled = {
    'tickets-incidents': useFeature('tickets-incidents'),
    'demandes-absence': useFeature('demandes-absence'),
  };
  const offlineEnabled = useFeature('offline_mode');
  useSyncHealthHeartbeat(
    {
      userId: userData?.id,
      nom: [userData?.prenom, userData?.nom].filter(Boolean).join(' ') || userData?.matricule,
      role: 'technicien',
    },
    isAuthenticated && offlineEnabled
  );
  const notifReader = {
    id: userData?.id,
    role: 'technicien',
    nom: [userData?.prenom, userData?.nom].filter(Boolean).join(' ') || userData?.matricule,
  };

  const baseMenuItems = [
    { key: 'maintenance', label: 'Maintenance', icon: <CalendarDays className="h-5 w-5" /> },
    { key: 'planning', label: 'Réparation', icon: <Wrench className="h-5 w-5" /> },
    { key: 'demandes-absence', label: "Demandes d'absence", icon: <CalendarOff className="h-5 w-5" />, featureKey: 'demandes-absence' },
    { key: 'tickets', label: 'Tickets', icon: <Ticket className="h-5 w-5" />, featureKey: 'tickets-incidents' },
  ];

  const menuItems = useMemo(
    () =>
      baseMenuItems.filter((item) =>
        (!item.featureKey || moduleFeatureEnabled[item.featureKey] !== false)
        && isAppSpaceTabEnabled(spaceTabFunctionalities, 'espace-technicien', item.key)
        && canAccessAppSpaceUserTab(spaceUserProfiles, 'espace-technicien', userData?.id, item.key)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spaceTabFunctionalities, spaceUserProfiles, userData?.id, moduleFeatureEnabled['tickets-incidents'], moduleFeatureEnabled['demandes-absence']]
  );

  useEffect(() => {
    const fallbackTab = menuItems[0]?.key || getFirstEnabledAppSpaceTab(spaceTabFunctionalities, 'espace-technicien')?.key || null;

    if (!menuItems.length) {
      setActiveSection('');
      return;
    }

    if (!menuItems.some((item) => item.key === activeSection) && fallbackTab) {
      setActiveSection(fallbackTab);
    }
  }, [activeSection, menuItems, spaceTabFunctionalities]);

  // Ferme le tiroir mobile après sélection d'une section
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [activeSection]);

  if (isCheckingSession) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-space-layout has-mobile-header flex flex-col gap-4 md:flex-row lg:gap-8">

      {/* En-tête mobile/PWA commun : profil + recherche + actions + menu */}
      <SpaceMobileHeader
        photoUrl={userData?.photo_url}
        initials={[userData?.prenom?.[0], userData?.nom?.[0]].filter(Boolean).join('') || 'TM'}
        name={`${userData?.prenom || ''} ${userData?.nom || ''}`.trim()}
        role="Technicien maintenance"
        actions={(
          <>
            <NotificationBell
              notifications={technicienNotifications}
              totalCount={technicienNotifCount}
              onNavigate={() => setIsMobileMenuOpen(false)}
              reader={notifReader}
              storageKey={userData?.id ? `t_${userData.id}` : null}
            />
            <RemonteeDialog sender={notifReader} iconOnly />
          </>
        )}
        menuOpen={isMobileMenuOpen}
        onToggleMenu={() => setIsMobileMenuOpen((open) => !open)}
      />

      {isMobileMenuOpen && (
        <div className="app-space-backdrop md:hidden" onClick={() => setIsMobileMenuOpen(false)} aria-hidden="true" />
      )}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`app-space-sidebar md:w-72 md:shrink-0 ${isMobileMenuOpen ? 'is-open' : ''}`}
      >
        <div className="app-space-sidebar-scroll sticky top-20 space-y-3 max-h-[calc(100vh-5.5rem)] overflow-y-auto pb-4 pr-1 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">

          {/* Carte de profil : masquée sur mobile (déplacée dans l'en-tête mobile), visible en desktop */}
          <SpaceHeaderIdentity>
            <SpaceHeaderProfile
              photoUrl={userData?.photo_url}
              initials={[userData?.prenom?.[0], userData?.nom?.[0]].filter(Boolean).join('') || 'TM'}
              name={`${userData?.prenom || ''} ${userData?.nom || ''}`.trim()}
              role="Technicien maintenance"
              actions={(
                <>
                  <NotificationBell
                    notifications={technicienNotifications}
                    totalCount={technicienNotifCount}
                    onNavigate={() => setIsMobileMenuOpen(false)}
                    reader={notifReader}
                    storageKey={userData?.id ? `t_${userData.id}` : null}
                  />
                  <RemonteeDialog sender={notifReader} iconOnly />
                </>
              )}
            />
          </SpaceHeaderIdentity>

          <Card className="relative overflow-hidden">
            <CardContent className="relative p-3">
              <nav className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = activeSection === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveSection(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                        isActive
                          ? 'border-primary/20 bg-primary/10 text-primary shadow-none'
                          : 'border-transparent text-foreground/80 hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      {React.cloneElement(item.icon, { className: 'h-4 w-4 shrink-0' })}
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="mt-2 border-t pt-1">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => { navigate('/'); setIsMobileMenuOpen(false); }}
                    className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-muted-foreground/70 transition-colors hover:bg-primary/8 hover:text-primary"
                  >
                    <Home className="h-5 w-5" />
                    <span className="text-[0.6rem] font-semibold">Accueil</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsProfileDialogOpen(true); setIsMobileMenuOpen(false); }}
                    className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-muted-foreground/70 transition-colors hover:bg-primary/8 hover:text-primary"
                  >
                    <UserCog className="h-5 w-5" />
                    <span className="text-[0.6rem] font-semibold">Profil</span>
                  </button>
                  <EnablePushButton reader={notifReader} asNavButton />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5 text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="text-[0.6rem] font-semibold">Déconn.</span>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.aside>

      <EditProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
        table="techniciens"
        recordId={userData?.id}
        withPhoto
        photoPrefix="photos_techniciens"
        currentPhotoUrl={userData?.photo_url || null}
        initialData={{ nom: userData?.nom, prenom: userData?.prenom, telephone: userData?.telephone, email: userData?.email }}
        onSaved={(fields) => setUserData((prev) => ({ ...(prev || {}), ...fields }))}
      />

      <main className="app-space-main has-tabbar min-w-0 flex-1 overflow-visible">
        <NotifEnableBanner reader={notifReader} className="mb-4" />
        <SwipeTabs items={menuItems.map((item) => ({ key: item.key, active: activeSection === item.key, onClick: () => setActiveSection(item.key) }))}>
        <PullToRefresh onRefresh={handlePullRefresh}>
        <motion.div
          key={`${activeSection}:${refreshKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Suspense fallback={<SectionLoader />}>
          {!menuItems.length ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Aucun onglet n’est actuellement activé pour l’Espace Technicien.
              </CardContent>
            </Card>
          ) : activeSection === 'demandes-absence' ? (
            <AbsenceRequestsPanel
              demandeur={{
                role: ABSENCE_ROLE_TECHNICIEN,
                id: userData?.id,
                matricule: userData?.matricule || null,
                nom: [userData?.prenom, userData?.nom].filter(Boolean).join(' ') || userData?.matricule || 'Technicien',
                agence_nom: null,
                secteur: null,
                region: null,
              }}
            />
          ) : activeSection === 'tickets' ? (
            <TicketsPanel
              mode="technicien"
              identity={{
                role: 'Technicien',
                id: userData?.id,
                nom: [userData?.prenom, userData?.nom].filter(Boolean).join(' ') || userData?.matricule || 'Technicien',
              }}
              filter={{ assigne_a_id: userData?.id }}
              spaceKey="espace-technicien"
              title="Mes tickets assignés"
              description="Incidents qui vous sont assignés : prise en charge et résolution."
            />
          ) : activeSection === 'planning' ? (
            <MonPlanningMaintenancePage technicien={userData} view="reparation" />
          ) : (
            <div className="space-y-6">
              <Card variant="accent">
                <CardHeader>
                  <CardTitle className="flex items-center text-3xl font-bold text-primary">
                    <CalendarDays className="mr-3 h-8 w-8" /> Maintenance
                  </CardTitle>
                  <CardDescription>Consultez votre planning et effectuez vos interventions de maintenance.</CardDescription>
                </CardHeader>
              </Card>
              <Tabs defaultValue="maintenance" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="maintenance" className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" /> Faire une Maintenance
                  </TabsTrigger>
                  <TabsTrigger value="planning" className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Mon Planning
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="maintenance">
                  <MaintenanceTab technicien={userData} />
                </TabsContent>
                <TabsContent value="planning">
                  <MonPlanningMaintenancePage technicien={userData} view="planning" hideTitle />
                </TabsContent>
              </Tabs>
            </div>
          )}
          </Suspense>
        </motion.div>
        </PullToRefresh>
        </SwipeTabs>
      </main>

      <MobileTabBar
        items={menuItems.map((item) => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
          active: activeSection === item.key,
          onClick: () => setActiveSection(item.key),
        }))}
        onMore={() => setIsMobileMenuOpen(true)}
        moreActive={isMobileMenuOpen}
      />
    </div>
  );
};

export default EspaceMaintenancePage;
