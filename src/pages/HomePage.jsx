
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, Wallet } from 'lucide-react';
import InstallAppButton from '@/components/InstallAppButton';
import { useClient } from '@/hooks/useFeatureFlags';
import { isProductName } from '@/lib/clientConfig';
import ProductLogo from '@/components/ProductLogo';
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

  const hasClientName = Boolean(client.displayName) && client.displayName !== 'PMU' && !isProductName(client.displayName);
  const isPointageEnabled = isAppSpaceFunctionalityEnabled(spaceFunctionalities, 'pointage');
  const isPaiementGrosGainEnabled = isAppSpaceFunctionalityEnabled(spaceFunctionalities, 'paiement-gros-gain');

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center p-4 md:p-8">

      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-8 w-full max-w-3xl md:mb-10"
      >
        <Card variant="elevated" className="border-border">
          <CardContent className="flex flex-col items-center px-4 py-7 text-center sm:px-8 sm:py-10 md:px-12">
            {/* Logo détouré, sans fond : c'est le titre de la page. */}
            <h1 className="mb-5 flex w-full justify-center sm:mb-7">
              <ProductLogo shape="auto" imgClassName="w-40 sm:w-[21rem] md:w-[23rem]" />
            </h1>
            {(client.logoUrl || hasClientName) && (
              <div className="home-client mb-5 flex max-w-full items-center justify-center gap-4 sm:mb-6 sm:gap-5">
                {client.logoUrl && (
                  <img src={client.logoUrl} alt={hasClientName ? '' : client.displayName || ''} className="h-16 w-auto max-w-[45%] shrink-0 object-contain sm:h-20" />
                )}
                {hasClientName && (
                  <p className="home-brand-client min-w-0 break-words text-left text-2xl font-extrabold tracking-wide text-primary sm:text-4xl">{client.displayName}</p>
                )}
              </div>
            )}
            <p className="home-brand-tagline mb-2 text-lg font-semibold text-foreground sm:text-xl md:text-2xl">
              Gestion de Planning & Pointage
            </p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Optimisez la gestion de vos agences avec une solution moderne, intuitive et performante.
            </p>
            {(isPointageEnabled || isPaiementGrosGainEnabled) && (
              <div className="mt-5 flex w-full flex-col items-center justify-center gap-2 sm:w-auto sm:flex-row sm:gap-3">
                {isPointageEnabled && (
                  <Button asChild size="sm" className="home-cta w-full max-w-[12.5rem] gap-1.5 sm:w-auto sm:max-w-none">
                    <Link to="/pointage">
                      <LogIn className="h-3.5 w-3.5" /> Commencer vos pointages
                    </Link>
                  </Button>
                )}
                {isPaiementGrosGainEnabled && (
                  <Button asChild size="sm" variant="outline" className="home-cta w-full max-w-[12.5rem] gap-1.5 sm:w-auto sm:max-w-none">
                    <Link to="/paiement-gros-gain">
                      <Wallet className="h-3.5 w-3.5" /> Demande de paiement
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
