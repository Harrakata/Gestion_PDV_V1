import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FormField from '@/components/ui/form-field';
import PageHeader from '@/components/ui/page-header';
import StatusBadge from '@/components/ui/status-badge';
import '@/index.css';

function DesignSystemFixture() {
  const [error, setError] = useState('');
  return (
    <main id="main-content" className="min-h-screen space-y-5 bg-background p-4 sm:p-8">
      <Card variant="accent" data-testid="primary-card">
        <CardHeader>
          <PageHeader title="Contrats visuels" description="Composants partagés du produit." />
        </CardHeader>
      </Card>
      <Card data-testid="secondary-card">
        <CardHeader><CardTitle>Informations</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="general">
            <TabsList aria-label="Sections" className="flex w-full">
              <TabsTrigger className="min-w-0 flex-1" value="general">Général</TabsTrigger>
              <TabsTrigger className="min-w-0 flex-1" value="details">Détails</TabsTrigger>
              <TabsTrigger className="min-w-0 flex-1" value="history">Historique</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="space-y-4">
              <FormField id="reference" label="Référence" required hint="Indiquez une référence unique." error={error}>
                <Input />
              </FormField>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="touch" onClick={() => setError('La référence est obligatoire.')}>Vérifier</Button>
                <StatusBadge tone="success">Actif</StatusBadge>
                <StatusBadge tone="danger">Bloqué</StatusBadge>
              </div>
            </TabsContent>
            <TabsContent value="details">Détails du dossier</TabsContent>
            <TabsContent value="history">Historique du dossier</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<DesignSystemFixture />);
