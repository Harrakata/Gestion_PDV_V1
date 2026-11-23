// Export / import des réglages de personnalisation (ex. d'un client à un autre).
const FILE_TYPE = 'gestion-pdv-personnalisation';
const MAX_SIZE = 64 * 1024;

export const serializeCustomization = (kind, values) =>
  JSON.stringify({ type: FILE_TYPE, version: 1, kind, values }, null, 2);

/** Valeurs brutes d'un fichier exporté ; lève une erreur si le fichier ne convient pas. */
export const parseCustomization = (text, kind) => {
  const content = JSON.parse(text);
  if (content?.type !== FILE_TYPE || content.kind !== kind || !content.values || typeof content.values !== 'object' || Array.isArray(content.values)) {
    throw new Error('Fichier de personnalisation non reconnu.');
  }
  return content.values;
};

export const readCustomizationFile = async (file, kind) => {
  if (file.size > MAX_SIZE) throw new Error('Fichier trop volumineux.');
  return parseCustomization(await file.text(), kind);
};

export const downloadCustomization = (kind, values) => {
  const url = URL.createObjectURL(new Blob([serializeCustomization(kind, values)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `personnalisation-${kind}.json`;
  link.click();
  URL.revokeObjectURL(url);
};
