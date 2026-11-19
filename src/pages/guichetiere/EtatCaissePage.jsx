import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
          <CardTitle className="flex items-center text-2xl font-bold text-primary">
            <Wallet className="mr-3 h-7 w-7" /> État de Caisse
          </CardTitle>
          <CardDescription>
            Consultez votre état de caisse mensuel.
            {fixedPrepose && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                Code préposé : <span className="font-mono font-semibold text-primary">{fixedPrepose}</span>
              </span>
            )}
          </CardDescription>
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
