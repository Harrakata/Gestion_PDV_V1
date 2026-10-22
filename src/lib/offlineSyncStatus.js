export const getOfflineSyncStatus = ({ online, count, failed, syncing }) => {
  if (failed > 0 && !syncing) return { kind: 'conflict', label: `Conflit à résoudre · ${failed}` };
  if (!online && count > 0) return { kind: 'local', label: `Enregistré localement · ${count}` };
  if (syncing || count > 0) return { kind: 'pending', label: `En attente${count > 0 ? ` · ${count}` : ''}` };
  return { kind: 'synced', label: 'Synchronisé' };
};
