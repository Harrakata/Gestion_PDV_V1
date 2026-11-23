import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import FormField from '@/components/ui/form-field';
import { Combobox } from '@/components/ui/Combobox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import SwipeTabs from '@/components/mobile/SwipeTabs';
import PullToRefresh from '@/components/mobile/PullToRefresh';

const options = Array.from({ length: 30 }, (_, index) => ({ value: String(index), label: `Agence ${index + 1}` }));
function Fixture() {
  const [open, setOpen] = useState(false);
  const [agency, setAgency] = useState('');
  const [tab, setTab] = useState('0');
  const [refreshes, setRefreshes] = useState(0);
  const [submits, setSubmits] = useState(0);
  const items = options.slice(0, 8).map(({ value }) => ({ key: value, active: tab === value, onClick: () => setTab(value) }));
  return <main id="main-content" className="container px-3 py-4"><div className="app-space-main mx-auto max-w-5xl space-y-4">
    <h1 className="text-xl text-primary">Ergonomie mobile</h1>
    <Button onClick={() => setOpen(true)}>Ouvrir le formulaire</Button>
    <Button variant="outline" onClick={() => setTab('7')}>Dernier onglet</Button>
    <output data-testid="active">{tab}</output>
    <output data-testid="refreshes">{refreshes}</output>
    <output data-testid="submits">{submits}</output>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="w-full !justify-start">
        {items.map(({ key }) => <TabsTrigger key={key} value={key}>Rubrique {Number(key) + 1}</TabsTrigger>)}
      </TabsList>
    </Tabs>
    <PullToRefresh onRefresh={async () => setRefreshes(value => value + 1)}>
      <SwipeTabs items={items}>
        <div data-testid="gesture-area" className="h-24 rounded-xl border p-4">Zone de navigation tactile</div>
        <FormField label="Recherche"><Input /></FormField>
        <FormField label="Notes"><Textarea className="text-sm" /></FormField>
        <Table aria-label="Terminaux" className="min-w-[1100px]">
          <TableBody><TableRow>{options.slice(0, 8).map(option => <TableCell key={option.value}>{option.label}</TableCell>)}</TableRow></TableBody>
        </Table>
      </SwipeTabs>
    </PullToRefresh>
    <div style={{ marginTop: '40vh' }}>
      <FormField label="Agence du filtre"><Combobox options={options} value={agency} onSelect={setAgency} placeholder="Choisir une agence" searchPlaceholder="Rechercher une agence" /></FormField>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Créer une intervention</DialogTitle><DialogDescription>Vérification des champs sur petit écran.</DialogDescription></DialogHeader>
        <form onSubmit={event => { event.preventDefault(); setSubmits(value => value + 1); }} className="space-y-4">
          <FormField label="Référence" required hint="Référence interne du terminal."><Input name="reference" /></FormField>
          <FormField label="Agence"><Combobox modal options={options} value={agency} onSelect={setAgency} placeholder="Choisir une agence" searchPlaceholder="Rechercher une agence" /></FormField>
          <FormField label="Description"><Textarea /></FormField>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit">Enregistrer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
