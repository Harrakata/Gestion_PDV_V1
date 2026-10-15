import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogTitle } from '../../src/components/ui/dialog';
import { Combobox } from '../../src/components/ui/Combobox';
import '../../src/index.css';

const options = [
  { value: 'TELPO390-0002', label: 'TELPO390-0002 · TELP390' },
  { value: 'TELPO390-0670', label: 'TELPO390-0670 · TELP390' },
];

function Fixture() {
  const [value, setValue] = useState('TELPO390-0670');
  return <Dialog open>
    <DialogContent>
      <DialogTitle>Modifier un Point de Vente Mobi</DialogTitle>
      <Combobox modal options={options} value={value} onSelect={setValue}
        placeholder="Sélectionner un terminal mobi" searchPlaceholder="Rechercher un terminal..."
        emptyText="Aucun terminal mobi disponible." />
      <output aria-label="Terminal choisi">{value}</output>
    </DialogContent>
  </Dialog>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
