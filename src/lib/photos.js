import { supabase } from '@/lib/supabaseClient';
import { STORAGE_BUCKET } from '@/lib/clientConfig';
import { enqueueOffline } from '@/lib/offlineQueue';
import { reportError } from '@/lib/errors';

// ════════════════════════════════════════════════════════════════════════════
//  Photos jointes (tickets, interventions de maintenance).
//
//  Une photo est réduite sur l'appareil (les clichés de téléphone font 3 à 8 Mo),
//  ce qui retire aussi ses métadonnées (position GPS…). L'adresse publique est
//  connue avant l'envoi : hors-ligne, elle est enregistrée tout de suite et le
//  fichier part avec la file d'attente.
// ════════════════════════════════════════════════════════════════════════════

export const MAX_PHOTOS = 4;
export const PHOTO_FOLDERS = { TICKET: 'photos_tickets', MAINTENANCE: 'photos_maintenance' };

const MAX_SIDE = 1600;
const QUALITY = 0.82;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const decode = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Prépare une photo choisie par l'utilisateur.
 * @returns {Promise<{ id, blob, previewUrl, url: null }>}
 * @throws {Error} message affichable tel quel
 */
export const preparePhoto = async (file) => {
  if (!file?.type?.startsWith('image/')) throw new Error("Ce fichier n'est pas une image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image trop volumineuse (25 Mo maximum).');
  let source;
  try {
    source = await decode(file);
  } catch {
    throw new Error("Cette image n'a pas pu être lue. Essayez au format JPEG ou PNG.");
  }
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; // fond des images transparentes
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', QUALITY); });
  if (!blob) throw new Error("Cette image n'a pas pu être préparée.");
  return { id: newId(), blob, previewUrl: URL.createObjectURL(blob), url: null };
};

export const releasePhoto = (photo) => { if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl); };

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine;
const isNetworkError = (error) =>
  /failed to fetch|network|load failed|timeout|aborted/i.test(`${error?.message || ''} ${error?.name || ''}`);

/**
 * Envoie les photos. Sans réseau, le fichier est mis en file et partira tout seul.
 * Une photo déjà envoyée (nouvelle tentative d'enregistrement) n'est pas renvoyée.
 * @returns {Promise<{ urls: string[], queued: number, failed: number }>}
 */
export const uploadPhotos = async (photos, folder) => {
  const result = { urls: [], queued: 0, failed: 0 };
  for (const photo of photos || []) {
    if (!photo.url) {
      const path = `${folder}/${new Date().toISOString().slice(0, 7)}/${photo.id}.jpg`;
      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      let error = null;
      let sent = false;
      if (!isOffline()) {
        try {
          ({ error } = await supabase.storage.from(STORAGE_BUCKET)
            .upload(path, photo.blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true }));
          sent = !error;
        } catch (thrown) {
          error = thrown;
        }
      }
      if (!sent && (isOffline() || isNetworkError(error))) {
        try {
          await enqueueOffline({
            type: 'photo',
            op: 'upload',
            upload: { bucket: STORAGE_BUCKET, path, fileBase64: await toDataUrl(photo.blob), contentType: 'image/jpeg' },
          });
          result.queued += 1;
          sent = true;
        } catch (queueError) {
          error = queueError;
        }
      }
      if (!sent) {
        reportError(error, { where: 'uploadPhotos' });
        result.failed += 1;
        continue;
      }
      photo.url = pub?.publicUrl || null;
    }
    if (photo.url) result.urls.push(photo.url);
  }
  return result;
};

/** Phrase pour l'utilisateur, ou null si tout est parti. */
export const photoUploadMessage = ({ queued = 0, failed = 0, columnMissing = false }) => {
  if (columnMissing) return "Photos non rattachées : la base de données doit être mise à jour. Prévenez l'exploitation.";
  if (failed) return `${failed} photo(s) n'ont pas pu être envoyées.`;
  if (queued) return `${queued} photo(s) seront envoyées au retour de la connexion.`;
  return null;
};

/** La base n'a pas encore la colonne `photos` (migration 202611241200). */
export const isMissingPhotosColumnError = (error) =>
  ['PGRST204', '42703'].includes(error?.code) && /photos/i.test(`${error?.message || ''} ${error?.details || ''}`);

/** Liste d'adresses valides (une colonne JSON peut contenir n'importe quoi). */
export const photoUrls = (value) => (Array.isArray(value) ? value : [])
  .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url));

/** { [id d'intervention]: url[] } — vide si la migration n'est pas appliquée. */
export const fetchInterventionPhotos = async () => {
  const { data, error } = await supabase
    .from('interventions_maintenance')
    .select('id, photos')
    .not('photos', 'is', null)
    .order('date_intervention', { ascending: false })
    .limit(1000);
  if (error) return {};
  return Object.fromEntries((data || []).map((row) => [String(row.id), photoUrls(row.photos)]).filter(([, urls]) => urls.length));
};
