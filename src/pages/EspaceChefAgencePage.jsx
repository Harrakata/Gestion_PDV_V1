import { useState, useEffect } from 'react';
import { describeError } from '@/lib/errors';
import SpaceShell from '@/components/SpaceShell';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UserCog, CalendarDays, ShieldCheck, Loader2, Timer, Wallet, Wrench, MapPin, ClipboardCheck, FileDown, CalendarOff, Ticket } from 'lucide-react';
import EditProfileDialog from '@/components/EditProfileDialog';
import ForgotPasswordDialog from '@/components/ForgotPasswordDialog';
import NotificationBell from '@/components/NotificationBell';
import { useSpaceNotifications, clearNotifWatch } from '@/hooks/useSpaceNotifications';
import PullToRefresh from '@/components/mobile/PullToRefresh';

const CHEF_AGENCE_TAB_LABELS = {
  'mon-planning': 'Planning',
  'mes-guichetieres': 'Guichet.',
  'maintenance-terminaux': 'Maint.',
  'suivi-pointage': 'Pointage',
  'points-vente-mobi': 'PDV',
  'paiement-gros-gain': 'Gains',
  absences: 'Absences',
  tickets: 'Tickets',
};
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { FormActions } from '@/components/ui/form-actions';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/components/ui/use-toast';
import { publicSupabase, supabase } from '@/lib/supabaseClient';
import { readAppSetting } from '@/lib/appSettings';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar.jsx';
import EmptyState from '@/components/ui/empty-state';
import { readChefAuth } from '@/lib/chefSession';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useSyncHealthHeartbeat } from '@/hooks/useSyncHealthHeartbeat';
import RemonteeDialog from '@/components/RemonteeDialog';
import NotifEnableBanner from '@/components/NotifEnableBanner';
import {
  APP_SPACE_SETTINGS_KEY,
  APP_SPACE_TAB_SETTINGS_KEY,
  APP_SPACE_USER_PROFILES_SETTINGS_KEY,
  buildDefaultAppSpaceFunctionalities,
  buildDefaultAppSpaceTabFunctionalities,
  buildDefaultAppSpaceUserProfiles,
  canAccessAppSpaceUserTab,
  getFirstEnabledAppSpaceTab,
  getEffectiveAppSpaceUserProfile,
  isAppSpaceTabEnabled,
  normalizeAppSpaceFunctionalities,
  normalizeAppSpaceTabFunctionalities,
  normalizeAppSpaceUserProfiles,
} from '@/lib/exploitationProfiles';
import { fetchAuthLinkedProfile } from '@/lib/smartAuth';

const loadSpaceUserProfilesSettings = async () => {
  const { data, error } = await readAppSetting(APP_SPACE_USER_PROFILES_SETTINGS_KEY);
  if (error) throw error;
  return normalizeAppSpaceUserProfiles(data?.value);
};

const resolveCurrentAgenceName = async ({ agenceName, codePDV } = {}) => {
  const cleanCode = String(codePDV || '').trim();
  const cleanName = String(agenceName || '').trim();

  if (cleanCode) {
    const { data } = await publicSupabase
      .from('agences')
      .select('nom, codePDV')
      .eq('codePDV', cleanCode)
      .eq('is_current', true)
      .maybeSingle();
    if (data?.nom) return data.nom;
  }

  if (!cleanName) return cleanName;

  const { data: currentByName } = await publicSupabase
    .from('agences')
    .select('nom, codePDV')
    .eq('nom', cleanName)
    .eq('is_current', true)
    .maybeSingle();
  if (currentByName?.nom) return currentByName.nom;

  const { data: historicalRows } = await publicSupabase
    .from('agences')
    .select('nom, codePDV')
    .eq('nom', cleanName)
    .limit(1);
  const historicalCode = historicalRows?.[0]?.codePDV;
  if (!historicalCode) return cleanName;

  const { data: currentByCode } = await publicSupabase
    .from('agences')
    .select('nom')
    .eq('codePDV', historicalCode)
    .eq('is_current', true)
    .maybeSingle();

  return currentByCode?.nom || cleanName;
};

const LoginPageChef = ({ onLogin }) => {
  const [matricule, setMatricule] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [authStep, setAuthStep] = useState('matricule');
  const [chefTrouve, setChefTrouve] = useState(null);
  const { toast } = useToast();

  const ensureChefProfileActive = async (chef) => {
    const profileSettings = await loadSpaceUserProfilesSettings().catch(() => buildDefaultAppSpaceUserProfiles());
    const effectiveProfile = getEffectiveAppSpaceUserProfile(profileSettings, 'espace-chef-agence', chef.id);
    if (effectiveProfile.statut !== 'Actif') {
      toast({
        title: 'Compte désactivé',
        description: "Votre profil Chef d'agence est désactivé. Contactez un administrateur.",
        variant: 'destructive',
      });
      return null;
    }
    return effectiveProfile;
  };

  const verifierMatricule = async (e) => {
    e.preventDefault();
    const id = matricule.trim();
    if (!id) {
      toast({
        title: "Identifiant requis",
        description: "Veuillez entrer votre matricule ou votre email pour continuer.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // L'utilisateur peut saisir un email OU un matricule
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
      const findChef = async () => {
        let query = publicSupabase.from('chefs_agence').select('*').eq('is_current', true);
        query = isEmail
          ? query.ilike('email', id)
          : query.ilike('matricule', id);
        return query.maybeSingle();
      };

      const { data: chef, error } = await findChef();

      if (error && error.code !== 'PGRST116') {
        toast({ title: "Erreur de connexion", description: describeError(error, 'EspaceChefAgencePage'), variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!chef) {
        toast({
          title: isEmail ? "Email inconnu" : "Matricule inconnu",
          description: "Cet identifiant n'est associé à aucun chef d'agence actif.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      // Stocker les informations du chef trouvé
      setChefTrouve(chef);
      
      setAuthStep('password');
      setIsLoading(false);
    } catch (error) {
      console.error("Erreur lors de la vérification du matricule:", error);
      toast({ title: "Erreur de connexion", description: "Une erreur est survenue lors de la vérification du matricule.", variant: "destructive" });
      setIsLoading(false);
    }
  };

  const authentifierParMotDePasse = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // ── Auth Supabase obligatoire : le mot de passe est vérifié contre auth.users (bcrypt) ──
    if (!chefTrouve?.email) {
      toast({
        title: "Email manquant",
        description: "Ce chef d'agence n'a pas d'email enregistré. Contactez un administrateur.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: String(chefTrouve.email).trim().toLowerCase(),
      password,
    });

    if (authErr || !authData?.user) {
      toast({
        title: "Échec de la connexion",
        description: authErr?.message?.includes('Invalid login credentials')
          ? "Mot de passe incorrect."
          : (authErr?.message ?? "Mot de passe incorrect."),
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // ── Vérifier que le compte auth est bien lié à CE chef d'agence ──
    if (chefTrouve.auth_user_id && chefTrouve.auth_user_id !== authData.user.id) {
      await supabase.auth.signOut();
      toast({
        title: "Compte non autorisé",
        description: "Ce mot de passe ne correspond pas au compte de ce matricule.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const effectiveProfile = await ensureChefProfileActive(chefTrouve);
    if (!effectiveProfile) {
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }

    onLogin(true, { ...chefTrouve, appSpaceProfile: effectiveProfile });
    toast({
      title: "Connexion réussie",
      description: `Bienvenue ${chefTrouve.prenom} ${chefTrouve.nom} dans votre Espace Chef d'Agence.`,
      className: "bg-success text-success-foreground",
    });
    setIsLoading(false);
  };
  
  const retourMatricule = () => {
    setAuthStep('matricule');
    setChefTrouve(null);
    setPassword('');
  };
  
  const authStepNumber = authStep === 'matricule' ? 1 : 2;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-[calc(100vh-200px)]"
    >
      <Card variant="elevated" className="w-full max-w-md border-border">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex h-12 items-center justify-center text-primary">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl text-primary sm:text-3xl">Accès Espace Chef d'Agence</CardTitle>
          <CardDescription className="text-center">
            {authStep === 'matricule' ? 'Entrez votre matricule pour commencer' : 'Entrez votre mot de passe'}
          </CardDescription>
          <div className="flex items-center gap-1.5 pt-1" role="progressbar" aria-label="Progression de la connexion" aria-valuemin={1} aria-valuemax={2} aria-valuenow={authStepNumber}>
            {[1, 2].map((step) => (
              <span key={step} className={`h-1.5 w-10 rounded-full ${step <= authStepNumber ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {/* ÉTAPE 1: SAISIE DU MATRICULE */}
          {authStep === 'matricule' && (
            <form onSubmit={verifierMatricule} className="space-y-6">
            <FormField id="matricule-chef" label="Identifiant" required>
              <Input
                type="text"
                placeholder="Matricule ou email"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </FormField>
              <Button
                type="submit"
                size="touch"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Vérification...' : 'Continuer'}
              </Button>
            </form>
          )}

          {/* ÉTAPE 2: MOT DE PASSE */}
          {authStep === 'password' && chefTrouve && (
            <form onSubmit={authentifierParMotDePasse} className="space-y-6">
              <div className="flex items-center justify-center mb-4">
                <Avatar className="h-16 w-16 border-2 border-primary">
                  {chefTrouve.photo_url ? (
                    <AvatarImage src={chefTrouve.photo_url} alt={`${chefTrouve.prenom} ${chefTrouve.nom}`} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                    {chefTrouve.prenom[0]}{chefTrouve.nom[0]}
                  </AvatarFallback>
                </Avatar>
              </div>
            <FormField id="password-chef" label="Mot de passe" required>
              <PasswordInput
                placeholder="Votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoFocus
              />
            </FormField>
              <FormActions>
                <Button
                  type="button"
                  onClick={retourMatricule}
                  variant="outline"
                  disabled={isLoading}
                >
                  Retour
                </Button>
                <Button
                  type="submit"
                  size="touch"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-5 w-5" />}
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
              </FormActions>
              <div className="text-center">
                <button type="button" onClick={() => setIsForgotOpen(true)} className="text-sm font-medium text-primary hover:underline">
                  Mot de passe oublié ?
                </button>
              </div>
              <ForgotPasswordDialog open={isForgotOpen} onOpenChange={setIsForgotOpen} />
          </form>
          )}

        </CardContent>
      </Card>
    </motion.div>
  );
};

const EspaceChefAgencePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(readChefAuth()?.isAuthenticated));
  const [chefAgenceInfo, setChefAgenceInfo] = useState(() => readChefAuth()?.chefInfo || null);
  const [chefDetails, setChefDetails] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const handlePullRefresh = async () => { setRefreshKey((k) => k + 1); await new Promise((r) => setTimeout(r, 500)); };
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [spaceFunctionalities, setSpaceFunctionalities] = useState(() => {
    try {
      return normalizeAppSpaceFunctionalities(
        JSON.parse(localStorage.getItem(APP_SPACE_SETTINGS_KEY) || '{}')
      );
    } catch (error) {
      return buildDefaultAppSpaceFunctionalities();
    }
  });
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
    spaceKey: 'espace-chef-agence',
    isAuthenticated,
    identity: chefAgenceInfo,
  });

  // Télémétrie santé synchro (best-effort) quand l'usage hors-ligne est actif.
  useSyncHealthHeartbeat(
    {
      userId: chefDetails?.id || chefAgenceInfo?.id,
      nom: chefAgenceInfo?.nomChef || [chefDetails?.prenom, chefDetails?.nom].filter(Boolean).join(' '),
      role: 'chef_agence',
      agence: chefAgenceInfo?.nomAgence,
    },
    isAuthenticated && spaceFunctionalities['offline_mode'] !== false
  );
  const notifReader = {
    id: chefDetails?.id || chefAgenceInfo?.id,
    role: 'chef_agence',
    nom: chefAgenceInfo?.nomChef || [chefDetails?.prenom, chefDetails?.nom].filter(Boolean).join(' '),
    agence: chefAgenceInfo?.nomAgence,
  };

  const { notifications: chefNotifications, totalCount: chefNotifCount } = useSpaceNotifications({
    spaceKey: 'espace-chef-agence',
    enabled: isAuthenticated,
    context: { chefId: chefDetails?.id || chefAgenceInfo?.id, agenceNom: chefAgenceInfo?.nomAgence },
  });

  // Charger les paramètres de session
  useEffect(() => {
    const loadSessionSettings = async () => {
      const { data, error } = await readAppSetting('general');

      if (!error && data && data.value) {
        setSessionDurationMinutes(data.value.sessionDureeMinutes || 30);
      }
    };

    loadSessionSettings();
  }, []);
  
  // Utiliser le hook de gestion de session
  const { sessionExpiring, formatTimeRemaining } = useSessionTimeout(
    sessionDurationMinutes,
    () => handleLogout(),
    'pmuChefAuth',
    { enabled: isAuthenticated }
  );

  useEffect(() => {
    // Charger les détails complets du chef d'agence si authentifié
    const loadChefDetails = async () => {
      if (isAuthenticated && chefAgenceInfo?.id) {
        const { data, error } = await publicSupabase
          .from('chefs_agence')
          .select('*')
          .eq('id', chefAgenceInfo.id)
          .single();
          
        if (!error && data) {
          let resolvedAgence = data.agenceEnCharge || chefAgenceInfo?.nomAgence;
          try {
            resolvedAgence = await resolveCurrentAgenceName({
              agenceName: resolvedAgence,
              codePDV: data.codePDV,
            });
          } catch {}
          const enrichedData = { ...data, agenceEnCharge: resolvedAgence };
          const enrichedInfo = {
            nomAgence: resolvedAgence || 'Agence non renseignée',
            nomChef: `${data.prenom} ${data.nom}`,
            matricule: data.matricule,
            codePDV: data.codePDV,
            id: data.id,
            photo_url: data.photo_url,
          };
          setChefDetails(enrichedData);
          setChefAgenceInfo(enrichedInfo);
          localStorage.setItem('pmuChefAuth', JSON.stringify({
            isAuthenticated: true,
            chefInfo: enrichedInfo,
          }));
        }
      }
    };
    
    loadChefDetails();
  }, [isAuthenticated, chefAgenceInfo?.id]);

  useEffect(() => {
    const handleFunctionalitiesUpdated = (event) => {
      setSpaceFunctionalities(normalizeAppSpaceFunctionalities(event.detail));
    };

    window.addEventListener('app-functionalities-updated', handleFunctionalitiesUpdated);
    return () => window.removeEventListener('app-functionalities-updated', handleFunctionalitiesUpdated);
  }, []);

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

  useEffect(() => {
    const prefix = '/espace-chef-agence/';
    if (location.pathname.startsWith(prefix)) {
      const subPath = location.pathname.slice(prefix.length).replace(/\/$/, '');
      if (subPath) try { localStorage.setItem('ps:chef-agence:lastPath', subPath); } catch {}
    }
  }, [location.pathname]);

  const handleLogin = async (status, chefData) => {
    setIsAuthenticated(status);
    if (status && chefData) {
      let resolvedAgence = chefData.agenceEnCharge;
      try {
        resolvedAgence = await resolveCurrentAgenceName({
          agenceName: resolvedAgence,
          codePDV: chefData.codePDV,
        });
      } catch {}
      const enrichedChefData = { ...chefData, agenceEnCharge: resolvedAgence };
      const authData = { 
        isAuthenticated: true, 
        chefInfo: { 
          nomAgence: resolvedAgence || 'Agence non renseignée',
          nomChef: `${chefData.prenom} ${chefData.nom}`, 
          matricule: chefData.matricule, 
          codePDV: chefData.codePDV,
          id: chefData.id,
          photo_url: chefData.photo_url
        } 
      };
      setChefAgenceInfo(authData.chefInfo);
      setChefDetails(enrichedChefData);
      localStorage.setItem('pmuChefAuth', JSON.stringify(authData));

      // Enregistrer la connexion du chef d'agence dans la base de données
      enregistrerConnexionChef(chefData.id);
    } else {
      localStorage.removeItem('pmuChefAuth');
      setChefAgenceInfo(null);
      setChefDetails(null);
    }
  };

  const handleLogout = async () => {
    if (isAuthenticated && chefAgenceInfo?.id) {
      // Enregistrer la déconnexion du chef d'agence
      enregistrerDeconnexionChef(chefAgenceInfo.id);
    }

    // Déconnexion Supabase Auth
    try { await supabase.auth.signOut(); } catch {}

    setIsAuthenticated(false);
    setChefAgenceInfo(null);
    setChefDetails(null);
    clearNotifWatch('espace-chef-agence');
    localStorage.removeItem('pmuChefAuth');
    toast({ title: "Déconnexion", description: "Vous avez été déconnecté.", className: "bg-primary text-primary-foreground" });
    navigate('/');
  };

  // Restauration automatique : si une session Supabase Auth existe (login par mot de passe),
  // on re-fetch le chef d'agence lié sans demander de re-login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAuthenticated) return; // déjà connecté sur cet appareil
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;
      const { data: chef } = await fetchAuthLinkedProfile({
        table: 'chefs_agence',
        authUserId: session.user.id,
        statusCol: 'is_current',
        activeValue: true,
      });
      if (cancelled) return;
      if (chef) {
        const profileSettings = await loadSpaceUserProfilesSettings().catch(() => buildDefaultAppSpaceUserProfiles());
        const effectiveProfile = getEffectiveAppSpaceUserProfile(profileSettings, 'espace-chef-agence', chef.id);
        if (effectiveProfile.statut !== 'Actif') {
          await supabase.auth.signOut();
          return;
        }
        const authData = {
          isAuthenticated: true,
          chefInfo: {
            nomAgence: await resolveCurrentAgenceName({
              agenceName: chef.agenceEnCharge,
              codePDV: chef.codePDV,
            }).catch(() => chef.agenceEnCharge),
            nomChef: `${chef.prenom} ${chef.nom}`,
            matricule: chef.matricule,
            codePDV: chef.codePDV,
            id: chef.id,
            photo_url: chef.photo_url,
          },
        };
        setSpaceUserProfiles(profileSettings);
        localStorage.setItem(APP_SPACE_USER_PROFILES_SETTINGS_KEY, JSON.stringify(profileSettings));
        setIsAuthenticated(true);
        setChefAgenceInfo(authData.chefInfo);
        setChefDetails({ ...chef, agenceEnCharge: authData.chefInfo.nomAgence, appSpaceProfile: effectiveProfile });
        localStorage.setItem('pmuChefAuth', JSON.stringify(authData));
      } else {
        // Session orpheline (aucun chef lié) → on déconnecte
        await supabase.auth.signOut();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ajouter ces nouvelles fonctions pour gérer les connexions/déconnexions
  const enregistrerConnexionChef = async (chefId) => {
    try {
      const dateConnexion = new Date().toISOString();
      const { error } = await supabase.from('connexions_chefs').insert({
        chef_agence_id: chefId,
        date_connexion: dateConnexion
      });
      
      if (error) {
        console.error("Erreur lors de l'enregistrement de la connexion:", error);
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la connexion:", error);
    }
  };
  
  const enregistrerDeconnexionChef = async (chefId) => {
    try {
      const dateDeconnexion = new Date().toISOString();
      
      // Récupérer la dernière connexion sans déconnexion pour ce chef
      const { data, error: fetchError } = await supabase
        .from('connexions_chefs')
        .select('*')
        .eq('chef_agence_id', chefId)
        .is('date_deconnexion', null)
        .order('date_connexion', { ascending: false })
        .limit(1);
        
      if (fetchError) {
        console.error("Erreur lors de la récupération de la connexion:", fetchError);
        return;
      }
      
      // Si on trouve une connexion sans déconnexion, la mettre à jour
      if (data && data.length > 0) {
        const { error: updateError } = await supabase
          .from('connexions_chefs')
          .update({ date_deconnexion: dateDeconnexion })
          .eq('id', data[0].id);
        
        if (updateError) {
          console.error("Erreur lors de l'enregistrement de la déconnexion:", updateError);
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la déconnexion:", error);
    }
  };

  const menuItems = [
    { path: 'mon-planning', label: 'Mon Planning', icon: <CalendarDays className="h-5 w-5" /> },
    { path: 'mes-guichetieres', label: 'Mes Guichetières', icon: <UserCog className="h-5 w-5" /> },
    { path: 'maintenance-terminaux', label: 'Maintenance Terminaux', icon: <Wrench className="h-5 w-5" /> },
    { path: 'suivi-pointage', label: 'Suivi Pointage', icon: <ClipboardCheck className="h-5 w-5" /> },
    { path: 'points-vente-mobi', label: 'Point de Vente Mobi', icon: <MapPin className="h-5 w-5" /> },
    {
      path: 'paiement-gros-gain',
      label: 'Paiement Gros Gain',
      icon: <Wallet className="h-5 w-5" />,
      featureKey: 'paiement-gros-gain',
    },
    { path: 'rapports', label: 'Rapports', icon: <FileDown className="h-5 w-5" /> },
    { path: 'absences', label: "Demandes d'absence", icon: <CalendarOff className="h-5 w-5" />, featureKey: 'demandes-absence' },
    { path: 'tickets', label: 'Tickets / Incidents', icon: <Ticket className="h-5 w-5" />, featureKey: 'tickets-incidents' },
  ].filter(
    (item) =>
      (!item.featureKey || spaceFunctionalities[item.featureKey] !== false) &&
      isAppSpaceTabEnabled(spaceTabFunctionalities, 'espace-chef-agence', item.path) &&
      canAccessAppSpaceUserTab(spaceUserProfiles, 'espace-chef-agence', chefDetails?.id || chefAgenceInfo?.id, item.path)
  );

  const normalizedPathname = location.pathname.replace(/\/+$/, '');
  const isMenuItemActive = (itemPath) => normalizedPathname === `/espace-chef-agence/${itemPath}`;

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!normalizedPathname.startsWith('/espace-chef-agence')) return;
    if (!menuItems.length) return;

    const fallbackPath = menuItems[0]?.path || getFirstEnabledAppSpaceTab(spaceTabFunctionalities, 'espace-chef-agence')?.key || null;
    if (!fallbackPath) return;

    const validPaths = menuItems.map((item) => `/espace-chef-agence/${item.path}`);

    if (!validPaths.includes(normalizedPathname)) {
      let savedPath;
      try { savedPath = localStorage.getItem('ps:chef-agence:lastPath'); } catch {}
      const target = (savedPath && validPaths.includes(`/espace-chef-agence/${savedPath}`))
        ? savedPath
        : fallbackPath;
      navigate(`/espace-chef-agence/${target}`, { replace: true });
    }
  }, [isAuthenticated, menuItems, navigate, normalizedPathname, spaceTabFunctionalities]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) {
    return <LoginPageChef onLogin={handleLogin} />;
  }

  const navigationItems = menuItems.map((item) => ({
    key: item.path,
    label: item.label,
    mobileLabel: CHEF_AGENCE_TAB_LABELS[item.path] || item.label,
    icon: item.icon,
    active: isMenuItemActive(item.path),
    to: `/espace-chef-agence/${item.path}`,
  }));

  return (
    <SpaceShell
      profile={{
        photoUrl: chefDetails?.photo_url || chefAgenceInfo?.photo_url,
        initials: chefAgenceInfo?.nomChef?.split(' ').map(n => n[0]).join('') || 'CA',
        name: chefAgenceInfo?.nomChef,
        role: "Chef d'agence",
        actions: (
          <>
            <NotificationBell
              notifications={chefNotifications}
              totalCount={chefNotifCount}
              onNavigate={() => setIsMobileMenuOpen(false)}
              reader={notifReader}
            />
            <RemonteeDialog sender={notifReader} iconOnly />
          </>
        ),
      }}
      menuOpen={isMobileMenuOpen}
      onMenuOpenChange={setIsMobileMenuOpen}
      menuItems={navigationItems}
      reader={notifReader}
      onProfile={() => setIsProfileDialogOpen(true)}
      onLogout={handleLogout}
      contentClassName="md:overflow-x-hidden"
      sidebarNote={sessionExpiring && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-muted p-3">
          <Timer className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
          <div className="text-xs font-medium text-warning-muted-foreground">
            <div>Session expirante</div>
            <div>{formatTimeRemaining()}</div>
          </div>
        </div>
      )}
      overlays={(
        <EditProfileDialog
          open={isProfileDialogOpen}
          onOpenChange={setIsProfileDialogOpen}
          table="chefs_agence"
          recordId={chefDetails?.id || chefAgenceInfo?.id}
          withPhoto
          photoPrefix="photos_chefs"
          currentPhotoUrl={chefDetails?.photo_url || null}
          initialData={{ nom: chefDetails?.nom, prenom: chefDetails?.prenom, telephone: chefDetails?.telephone, email: chefDetails?.email }}
          onSaved={(fields) => {
            setChefDetails((prev) => ({ ...(prev || {}), ...fields }));
            const nomChef = `${fields.prenom} ${fields.nom}`.trim();
            setChefAgenceInfo((prev) => (prev ? { ...prev, nomChef } : prev));
            try {
              const stored = JSON.parse(localStorage.getItem('pmuChefAuth') || 'null');
              if (stored?.chefInfo) {
                stored.chefInfo.nomChef = nomChef;
                localStorage.setItem('pmuChefAuth', JSON.stringify(stored));
              }
            } catch {}
          }}
        />
      )}
    >
      <NotifEnableBanner reader={notifReader} className="mb-4" />
      <PullToRefresh onRefresh={handlePullRefresh}>
      <motion.div
        key={`${location.pathname}:${refreshKey}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        {!menuItems.length ? (
          <Card>
            <CardContent className="p-6"><EmptyState compact title="Aucun onglet n’est actuellement autorisé pour votre profil Chef d'agence" /></CardContent>
          </Card>
        ) : (
          <Outlet
            context={{
              nomAgence: chefAgenceInfo?.nomAgence,
              chefInfo: chefAgenceInfo,
              chefDetails: chefDetails || { codePDV: chefAgenceInfo?.codePDV },
            }}
          />
        )}
      </motion.div>
      </PullToRefresh>
    </SpaceShell>
  );
};

export default EspaceChefAgencePage;
