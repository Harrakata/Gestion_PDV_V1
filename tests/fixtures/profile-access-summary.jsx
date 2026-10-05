import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProfileAccessSummary from '../../src/components/ProfileAccessSummary';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../src/components/ui/table';
import { APP_SPACE_TAB_FUNCTIONALITIES, flattenSpaceTabItems } from '../../src/lib/exploitationProfiles';
import '../../src/index.css';

const tabs = flattenSpaceTabItems(APP_SPACE_TAB_FUNCTIONALITIES.find((entry) => entry.spaceKey === 'espace-exploitation').tabs);
const profiles = [
  { name: 'Profil A', permissions: Object.fromEntries(tabs.map((tab) => [tab.key, 'write'])) },
  { name: 'Profil B', permissions: Object.fromEntries(tabs.map((tab) => [tab.key, 'read'])) },
  { name: 'Sans accès', permissions: {} },
  { name: 'Profil mixte', permissions: { 'maintenance-terminaux': 'write', 'maintenance-terminaux.reparation': 'read', 'maintenance-terminaux.reparation.atelier': 'write', agences: 'none' } },
];

function Fixture() {
  const [space, setSpace] = useState('exploitation');
  return <main className="mx-auto max-w-5xl space-y-4 p-4">
    <h1 className="text-xl font-semibold">Profils utilisateurs</h1>
    <button type="button" onClick={() => setSpace('technicien')}>Changer d’espace</button>
    <Table>
      <TableHeader><TableRow><TableHead>Utilisateur</TableHead><TableHead>Accès autorisés</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
      <TableBody>{profiles.map(({ name, permissions }) => <TableRow key={name}>
        <TableCell>{name}</TableCell>
        <TableCell><ProfileAccessSummary key={`${space}:${name}`} permissions={permissions}
          accessCount={{ readCount: Object.values(permissions).filter((level) => level === 'read').length, writeCount: Object.values(permissions).filter((level) => level === 'write').length }}
          accessibleTabs={tabs.filter((tab) => ['read', 'write'].includes(permissions[tab.key]))} /></TableCell>
        <TableCell>Actif</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
