import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfflineSyncStatus } from '../../src/lib/offlineSyncStatus.js';
import { buildDefaultAppSpaceFunctionalities } from '../../src/lib/exploitationProfiles.js';

test('offline synchronization states use readable labels', () => {
  assert.deepEqual(getOfflineSyncStatus({ online: false, count: 2, failed: 0 }), {
    kind: 'local', label: 'Enregistré localement · 2',
  });
  assert.deepEqual(getOfflineSyncStatus({ online: true, count: 2, failed: 0 }), {
    kind: 'pending', label: 'En attente · 2',
  });
  assert.deepEqual(getOfflineSyncStatus({ online: true, count: 1, failed: 1 }), {
    kind: 'conflict', label: 'Conflit à résoudre · 1',
  });
  assert.deepEqual(getOfflineSyncStatus({ online: true, count: 0, failed: 0 }), {
    kind: 'synced', label: 'Synchronisé',
  });
  assert.equal(getOfflineSyncStatus({ online: true, count: 1, failed: 1, syncing: true }).kind, 'pending');
});

test('offline mode starts disabled', () => {
  assert.equal(buildDefaultAppSpaceFunctionalities().offline_mode, false);
});
