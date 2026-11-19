import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { describeError } from '@/lib/errors';
import SpaceHeaderIdentity from '@/components/SpaceHeaderIdentity';
import SpaceHeaderProfile from '@/components/SpaceHeaderProfile';
import SpaceMobileHeader from '@/components/SpaceMobileHeader';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ListTree, Loader2, LogOut, AtSign, UserCog, Menu, X, Building, Smartphone,
  Globe, ClipboardCheck, Wrench, Wallet, Home, FileDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { smartSignIn, fetchOrLinkAuthProfile } from '@/lib/smartAuth';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import {
  APP_SPACE_TAB_SETTINGS_KEY,
  APP_SPACE_USER_PROFILES_SETTINGS_KEY,
  buildDefaultAppSpaceTabFunctionalities,
  buildDefaultAppSpaceUserProfiles,
  canAccessAppSpaceUserTab,
  getEffectiveAppSpaceUserProfile,
  getFirstEnabledAppSpaceTab,
  isAppSpaceTabEnabled,
  normalizeAppSpaceTabFunctionalities,
  normalizeAppSpaceUserProfiles,
} from '@/lib/exploitationProfiles';

const SPACE_KEY = 'espace-chef-secteur';

const loadSpaceUserProfilesSettings = async () => {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', APP_SPACE_USER_PROFILES_SETTINGS_KEY).single();
  if (error && error.code !== 'PGRST116') throw error;
  return normalizeAppSpaceUserProfiles(data?.value);
};

const loadSpaceTabSettings = async () => {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', APP_SPACE_TAB_SETTINGS_KEY).single();
  if (error && error.code !== 'PGRST116') throw error;
  return normalizeAppSpaceTabFunctionalities(data?.value);
};
import EditProfileDialog from '@/components/EditProfileDialog';
import ForgotPasswordDialog from '@/components/ForgotPasswordDialog';
import SpaceLoginCard from '@/components/SpaceLoginCard';
import KpiStatCard from '@/components/analytics/KpiStatCard';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PointagesSecteurSection, MaintenanceSecteurSection, PaiementsSecteurSection } from '@/components/chef_secteur/SecteurSupervision';
import RapportsPage from '@/pages/exploitation/RapportsPage';
import { REPORT_SCOPES } from '@/lib/reportsService';
import MobileTabBar from '@/components/mobile/MobileTabBar';
import PullToRefresh from '@/components/mobile/PullToRefresh';
import SwipeTabs from '@/components/mobile/SwipeTabs';
import NotificationBell from '@/components/NotificationBell';
import RemonteeDialog from '@/components/RemonteeDialog';
import EnablePushButton from '@/components/EnablePushButton';
import NotifEnableBanner from '@/components/NotifEnableBanner';
import useSpaceNotifications, { clearNotifWatch } from '@/hooks/useSpaceNotifications';

const SECTEUR_TAB_LABELS = { agences: 'Agences', pointages: 'Pointages', maintenance: 'Maint.', paiements: 'Paiements' };

const AUTH_KEY = 'chefSecteurAuth';

const LoginPage = ({ onLogin }) => {
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { data: authData, error: authErr } = await smartSignIn({ identifier, password, table: 'chefs_secteur' });
    if (authErr || !authData?.user) {
      toast({ title: 'Connexion échouée', description: 'Identifiant ou mot de passe incorrect.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }
    const { data: profile, error: profileErr } = await fetchOrLinkAuthProfile({
      table: 'chefs_secteur', authUserId: authData.user.id, identifier, authEmail: authData.user.email,
    });
    if (profileErr || !profile) {
      await supabase.auth.signOut();
      toast({ title: 'Aucun profil chef de secteur', description: "Votre compte n'est lié à aucune fiche chef de secteur.", variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    // Statut du profil utilisateur d'espace (Actif/Inactif)
    const profileSettings = await loadSpaceUserProfilesSettings().catch(() => buildDefaultAppSpaceUserProfiles());
    const effectiveProfile = getEffectiveAppSpaceUserProfile(profileSettings, SPACE_KEY, profile.id);
    if (effectiveProfile.statut !== 'Actif') {
      await supabase.auth.signOut();
      toast({ title: 'Compte désactivé', description: 'Votre profil Chef de secteur est désactivé. Contactez un administrateur.', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    onLogin(profile);
    toast({ title: 'Connexion réussie', description: `Bienvenue ${profile.prenom} ${profile.nom}`, className: 'bg-success text-white' });
    setIsLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <SpaceLoginCard
        title="Espace Chef de secteur"
        description="Connectez-vous avec votre email ou votre matricule."
        icon={<ListTree />}
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

const NAV_ITEMS = [
  { key: 'agences', label: 'Mes agences', icon: Building },
  { key: 'pointages', label: 'Pointages', icon: ClipboardCheck },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench },
  { key: 'paiements', label: 'Paiements de gain', icon: Wallet },
  { key: 'rapports', label: 'Rapports', icon: FileDown },
];

// Centre de rapports pour le Chef de secteur : périmètre = agences du secteur.
const RapportsSecteurSection = ({ chef }) => {
  const [agenceNames, setAgenceNames] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('agences')
        .select('nom')
        .eq('is_current', true)
        .eq('secteur', chef.secteurEnCharge)
        .order('nom', { ascending: true });
      if (!cancelled) setAgenceNames((data || []).map((a) => a.nom).filter(Boolean));
    })();
    return () => { cancelled = true; };
  }, [chef.secteurEnCharge]);

  return (
    <RapportsPage
      scope={REPORT_SCOPES.CHEF_SECTEUR}
      allowedAgenceNames={agenceNames}
      actor={{
        id: chef?.id || null,
        name: [chef?.prenom, chef?.nom].filter(Boolean).join(' ') || 'Chef de secteur',
        role: 'Chef de secteur',
      }}
    />
  );
};

const AgencesSecteurSection = ({ chef }) => {
  const { toast } = useToast();
  const [agences, setAgences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('agences').select('*').eq('is_current', true).eq('secteur', chef.secteurEnCharge).order('nom', { ascending: true });
      if (cancelled) return;
      if (error) toast({ title: 'Erreur de chargement', description: describeError(error, 'EspaceChefSecteurPage'), variant: 'destructive' });
      else setAgences(data || []);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [chef.secteurEnCharge, toast]);

  const totalTerminaux = useMemo(() => agences.reduce((s, a) => s + Number(a.nbreTerminaux || 0), 0), [agences]);

  return (
    <div className="space-y-4">
      <Card variant="accent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl text-primary"><Building className="h-6 w-6" /> Agences du secteur</CardTitle>
          <CardDescription>Secteur : <span className="font-semibold">{chef.secteurEnCharge || '—'}</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3">
            <KpiStatCard icon={Building} label="Agences" value={agences.length} tone="primary" />
            <KpiStatCard icon={Smartphone} label="Terminaux déclarés" value={totalTerminaux} tone="violet" />
            <KpiStatCard icon={Globe} label="Région" value={agences[0]?.region || chef.region || '—'} tone="blue" />
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Chargement…</p>
          ) : (
            <Table className="responsive-cards">
              <TableCaption>{agences.length === 0 ? 'Aucune agence rattachée à ce secteur.' : `${agences.length} agence(s).`}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Agence</TableHead>
                  <TableHead>Code PDV</TableHead>
                  <TableHead>Région</TableHead>
                  <TableHead>Terminaux</TableHead>
                  <TableHead>Adresse</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agences.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell data-label="Agence" className="font-medium">{a.nom}</TableCell>
                    <TableCell data-label="Code PDV">{a.codePDV || 'N/A'}</TableCell>
                    <TableCell data-label="Région">{a.region || 'N/A'}</TableCell>
                    <TableCell data-label="Terminaux">{a.nbreTerminaux ?? 0}</TableCell>
                    <TableCell data-label="Adresse">{a.adresse || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const EspaceChefSecteurPage = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [chef, setChef] = useState(null);
  const [activeSection, setActiveSection] = useState('agences');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handlePullRefresh = async () => { setRefreshKey((k) => k + 1); await new Promise((r) => setTimeout(r, 500)); };
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [spaceTabFunctionalities, setSpaceTabFunctionalities] = useState(() => buildDefaultAppSpaceTabFunctionalities());
  const [spaceUserProfiles, setSpaceUserProfiles] = useState(() => buildDefaultAppSpaceUserProfiles());

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (saved?.isAuthenticated && saved?.chef) {
        setChef(saved.chef);
        setIsAuthenticated(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Réglages d'activation des onglets + profils utilisateurs d'espace
  useEffect(() => {
    if (!isAuthenticated) return;
    loadSpaceTabSettings().then(setSpaceTabFunctionalities).catch(() => {});
    loadSpaceUserProfilesSettings().then(setSpaceUserProfiles).catch(() => {});
  }, [isAuthenticated]);

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) =>
      isAppSpaceTabEnabled(spaceTabFunctionalities, SPACE_KEY, item.key)
      && canAccessAppSpaceUserTab(spaceUserProfiles, SPACE_KEY, chef?.id, item.key)
    ),
    [spaceTabFunctionalities, spaceUserProfiles, chef?.id]
  );

  // L'onglet actif doit rester accessible
  useEffect(() => {
    if (!chef) return;
    if (!visibleNavItems.some((i) => i.key === activeSection)) {
      const first = visibleNavItems[0]?.key || getFirstEnabledAppSpaceTab(spaceTabFunctionalities, SPACE_KEY)?.key || 'agences';
      setActiveSection(first);
    }
  }, [visibleNavItems, activeSection, spaceTabFunctionalities, chef]);

  useEffect(() => { setIsMobileMenuOpen(false); }, [activeSection]);

  useActivityTracker({ spaceKey: 'espace-chef-secteur', isAuthenticated, identity: chef });

  // Déconnexion automatique après inactivité (durée : Paramètres > session).
  useSessionTimeout(null, () => handleLogout(), AUTH_KEY, { enabled: isAuthenticated });

  const handleLogin = useCallback((profile) => {
    setChef(profile);
    setIsAuthenticated(true);
    try { localStorage.setItem(AUTH_KEY, JSON.stringify({ isAuthenticated: true, chef: profile })); } catch { /* ignore */ }
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    clearNotifWatch(SPACE_KEY);
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    setChef(null);
    navigate('/');
  }, [navigate]);

  // ⚠ Tous les hooks doivent être appelés inconditionnellement, AVANT tout return
  // conditionnel (sinon « Rendered more hooks than during the previous render »).
  const { notifications: chefNotifications, totalCount: chefNotifCount, refresh: refreshChefNotifs } = useSpaceNotifications({
    spaceKey: SPACE_KEY,
    enabled: isAuthenticated && !!chef,
    context: { secteurNom: chef?.secteurEnCharge },
  });

  if (!isAuthenticated || !chef) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const initials = `${chef.prenom?.charAt(0) || ''}${chef.nom?.charAt(0) || ''}`.toUpperCase() || 'CS';

  return (
    <div className="app-space-layout has-mobile-header flex flex-col gap-4 md:flex-row lg:gap-8">

      {/* En-tête mobile/PWA commun : profil + recherche + actions + menu */}
      <SpaceMobileHeader
        photoUrl={chef.photo_url}
        initials={initials}
        name={`${chef.prenom || ''} ${chef.nom || ''}`.trim()}
        actions={(
          <>
            <NotificationBell notifications={chefNotifications} totalCount={chefNotifCount} onRefresh={refreshChefNotifs} reader={{ id: chef?.id, role: 'chef_secteur', nom: [chef?.prenom, chef?.nom].filter(Boolean).join(' '), agence: null }} />
            <RemonteeDialog sender={{ id: chef?.id, role: 'chef_secteur', nom: [chef?.prenom, chef?.nom].filter(Boolean).join(' ') }} iconOnly />
          </>
        )}
        menuOpen={isMobileMenuOpen}
        onToggleMenu={() => setIsMobileMenuOpen((open) => !open)}
      />

      {isMobileMenuOpen && <div className="app-space-backdrop md:hidden" onClick={() => setIsMobileMenuOpen(false)} aria-hidden="true" />}

      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`app-space-sidebar md:w-72 md:shrink-0 ${isMobileMenuOpen ? 'is-open' : ''}`}
      >
        <div className="app-space-sidebar-scroll sticky top-20 space-y-3 max-h-[calc(100vh-5.5rem)] overflow-y-auto pb-4 pr-1">
          <SpaceHeaderIdentity>
            <SpaceHeaderProfile
              photoUrl={chef.photo_url}
              initials={initials}
              name={`${chef.prenom || ''} ${chef.nom || ''}`.trim()}
              actions={(
                <>
                  <NotificationBell notifications={chefNotifications} totalCount={chefNotifCount} onRefresh={refreshChefNotifs} reader={{ id: chef?.id, role: 'chef_secteur', nom: [chef?.prenom, chef?.nom].filter(Boolean).join(' '), agence: null }} />
                  <RemonteeDialog sender={{ id: chef?.id, role: 'chef_secteur', nom: [chef?.prenom, chef?.nom].filter(Boolean).join(' ') }} iconOnly />
                </>
              )}
            />
          </SpaceHeaderIdentity>

          <Card className="relative overflow-hidden">
            <CardContent className="relative p-3">
              <nav className="space-y-0.5">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveSection(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-2xl border border-transparent px-3 py-2.5 text-sm font-semibold transition-all ${
                        isActive ? 'bg-primary/10 text-primary shadow-none' : 'text-foreground/80 hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="mt-1 border-t pt-1">
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
                <EnablePushButton reader={{ id: chef?.id, role: 'chef_secteur', nom: [chef?.prenom, chef?.nom].filter(Boolean).join(' '), agence: null }} asNavButton />
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

      <main className="app-space-main has-tabbar min-w-0 flex-1 overflow-visible">
        <NotifEnableBanner
          reader={{ id: chef?.id, role: 'chef_secteur', nom: [chef?.prenom, chef?.nom].filter(Boolean).join(' '), agence: null }}
          className="mb-4"
        />
        <SwipeTabs items={visibleNavItems.map((item) => ({ key: item.key, active: activeSection === item.key, onClick: () => setActiveSection(item.key) }))}>
        <PullToRefresh onRefresh={handlePullRefresh}>
        <motion.div
          key={`${activeSection}:${refreshKey}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {activeSection === 'agences' && <AgencesSecteurSection chef={chef} />}
          {activeSection === 'pointages' && <PointagesSecteurSection chef={chef} />}
          {activeSection === 'maintenance' && <MaintenanceSecteurSection chef={chef} />}
          {activeSection === 'paiements' && <PaiementsSecteurSection chef={chef} />}
          {activeSection === 'rapports' && <RapportsSecteurSection chef={chef} />}
        </motion.div>
        </PullToRefresh>
        </SwipeTabs>
      </main>

      <MobileTabBar
        items={visibleNavItems.map((item) => ({
          key: item.key,
          label: SECTEUR_TAB_LABELS[item.key] || item.label,
          icon: React.createElement(item.icon),
          active: activeSection === item.key,
          onClick: () => setActiveSection(item.key),
        }))}
        onMore={() => setIsMobileMenuOpen(true)}
        moreActive={isMobileMenuOpen}
      />

      <EditProfileDialog
        open={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
        table="chefs_secteur"
        recordId={chef?.id}
        withPhoto
        photoPrefix="photos_chefs_secteur"
        currentPhotoUrl={chef?.photo_url || null}
        initialData={{ nom: chef?.nom, prenom: chef?.prenom, telephone: chef?.telephone, email: chef?.email }}
        onSaved={(fields) => {
          const updated = { ...chef, ...fields };
          setChef(updated);
          try { localStorage.setItem(AUTH_KEY, JSON.stringify({ isAuthenticated: true, chef: updated })); } catch { /* ignore */ }
        }}
      />
    </div>
  );
};

export default EspaceChefSecteurPage;
