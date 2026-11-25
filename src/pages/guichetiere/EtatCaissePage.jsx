import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import PageHeader from '@/components/ui/page-header';
import SalaireGuichetiereTab from '@/pages/exploitation/SalaireGuichetiereTab';

const EtatCaissePage = () => {
  const { guichetiereDetails } = useOutletContext();

  const fixedPrepose = guichetiereDetails?.codePrepose || null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <Card variant="accent">
        <CardHeader>
          <PageHeader
            icon={<Wallet />}
            title="État de Caisse"
            description="Consultez votre état de caisse mensuel."
            meta={fixedPrepose && (
              <span>Code préposé : <span className="font-mono font-semibold text-primary">{fixedPrepose}</span></span>
            )}
          />
        </CardHeader>
      </Card>

      {!fixedPrepose ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          Code préposé introuvable pour ce compte. Contactez l'administrateur.
        </Card>
      ) : (
        <SalaireGuichetiereTab
          fixedPrepose={fixedPrepose}
          canWrite={false}
        />
      )}
    </motion.div>
  );
};

export default EtatCaissePage;
