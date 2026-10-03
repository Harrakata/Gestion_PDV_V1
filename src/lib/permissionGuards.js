export const READ_ONLY_MESSAGE = 'Votre profil est en lecture seule sur cet onglet.';

export const guardWriteAccess = (canWrite, toast, event) => {
  if (canWrite) return true;
  if (event?.target) event.target.value = null;
  toast?.({
    title: 'Accès insuffisant',
    description: READ_ONLY_MESSAGE,
    variant: 'destructive',
  });
  return false;
};

export const resetFileInput = (event) => {
  if (event?.target) event.target.value = null;
};
