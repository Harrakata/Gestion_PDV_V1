
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, Wallet } from 'lucide-react';
import InstallAppButton from '@/components/InstallAppButton';
import { useClient } from '@/hooks/useFeatureFlags';
import {
  APP_SPACE_SETTINGS_KEY,
  buildDefaultAppSpaceFunctionalities,
  isAppSpaceFunctionalityEnabled,
  normalizeAppSpaceFunctionalities,
} from '@/lib/exploitationProfiles';

const HomePage = () => {
  const client = useClient();
  const [spaceFunctionalities, setSpaceFunctionalities] = React.useState(() => {
    try {
      return normalizeAppSpaceFunctionalities(
        JSON.parse(window.localStorage.getItem(APP_SPACE_SETTINGS_KEY) || '{}')
      );
    } catch {
      return buildDefaultAppSpaceFunctionalities();
    }
  });

  React.useEffect(() => {
    const handleFunctionalitiesUpdated = (event) => {
      setSpaceFunctionalities(normalizeAppSpaceFunctionalities(event.detail));
    };
    window.addEventListener('app-functionalities-updated', handleFunctionalitiesUpdated);
    return () => window.removeEventListener('app-functionalities-updated', handleFunctionalitiesUpdated);
  }, []);

  const isPointageEnabled = isAppSpaceFunctionalityEnabled(spaceFunctionalities, 'pointage');
  const isPaiementGrosGainEnabled = isAppSpaceFunctionalityEnabled(spaceFunctionalities, 'paiement-gros-gain');

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center bg-background p-4 md:p-8">

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 w-full max-w-3xl md:mb-10"
      >
        <Card variant="elevated" className="border-border">
          <CardContent className="flex flex-col items-center px-4 py-7 text-center sm:px-8 sm:py-9 md:px-12">
            <img
              src={client.logoUrl || "/carrus-logo.png"}
              alt={client.displayName || "CARRUS Betting Solutions & Services"}
              className="mx-auto mb-4 h-16 w-auto object-contain sm:h-20 md:h-28"
            />
            <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              <span className="text-primary">
                GestionPDV
              </span>
            </h1>
            {client.displayName && client.displayName !== 'PMU' && (
              <p className="mb-2 text-sm font-semibold text-primary sm:text-base">
                {client.displayName}
              </p>
            )}
            <p className="mb-2 text-lg font-semibold text-foreground sm:text-xl md:text-2xl">
              Gestion de Planning & Pointage
            </p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Optimisez la gestion de vos agences avec une solution moderne, intuitive et performante.
            </p>
            {(isPointageEnabled || isPaiementGrosGainEnabled) && (
              <div className="mt-6 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                {isPointageEnabled && (
                  <Button asChild size="touch" className="w-full sm:w-auto">
                    <Link to="/pointage">
                      <LogIn className="h-5 w-5" /> Commencer vos pointages
                    </Link>
                  </Button>
                )}
                {isPaiementGrosGainEnabled && (
                  <Button asChild size="touch" variant="outline" className="w-full sm:w-auto">
                    <Link to="/paiement-gros-gain">
                      <Wallet className="h-5 w-5" /> Demande de paiement
                    </Link>
                  </Button>
                )}
              </div>
            )}
            {/* Installation PWA (s'affiche seulement si installable et pas déjà installée) */}
            <div className="mt-4 flex justify-center">
              <InstallAppButton />
            </div>
          </CardContent>
        </Card>
      </motion.header>

    </div>
  );
};

export default HomePage;
