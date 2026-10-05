import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SalaryCashAssistant from '../../src/components/analytics/SalaryCashAssistant';
import { buildReconciliationRows } from '../../src/lib/salaryReconciliation';
import '../../src/index.css';

const rows = buildReconciliationRows(
  Array.from({ length: 66 }, (_, i) => ({ operateur: String(i + 1), mt_enr: (i + 1) * 10000, date_op: '2026-05-02' })),
  [{ guichetiere_code: '1', montant: 5000, date_versement: '2026-05-03' }],
  [{ codePrepose: '1', nom: 'Lombay', prenom: 'Mélanie', agenceAssigne: 'Gombe' }],
  [{ nom: 'Gombe', region: 'Kinshasa', secteur: 'Lukunga' }],
);

function Fixture() {
  const [month, setMonth] = useState('2026-05');
  const [opened, setOpened] = useState('');
  const params = new URLSearchParams(window.location.search);
  return <main className="mx-auto max-w-6xl p-4">
    <SalaryCashAssistant rows={rows} month={{ monthKey: month, label: month }} loading={params.has('loading')}
      error={params.has('error') ? 'Rapprochement indisponible' : ''} onMonthChange={setMonth}
      onOpenPrepose={(code) => setOpened(`${code} / ${month}`)} onOpenDetail={() => setOpened(month)} />
    <output aria-label="Destination">{opened}</output>
  </main>;
}

createRoot(document.getElementById('root')).render(<Fixture />);
