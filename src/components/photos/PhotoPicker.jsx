import { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { MAX_PHOTOS, preparePhoto, releasePhoto } from '@/lib/photos';

// Appareil tactile (téléphone, tablette) : l'appareil photo a un sens.
const hasCamera = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

/**
 * Choix de photos : importer, ou prendre la photo sur un appareil tactile.
 * Les photos restent sur l'appareil jusqu'à l'enregistrement (`uploadPhotos`) ;
 * l'écran les garde avec `usePhotoSelection`.
 */
const PhotoPicker = ({ photos, onChange, max = MAX_PHOTOS, disabled = false, label = 'Photos (facultatif)' }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const importRef = useRef(null);
  const cameraRef = useRef(null);
  const latest = useRef(photos);
  latest.current = photos;
  const full = photos.length >= max;

  const add = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = ''; // permet de reprendre le même fichier
    if (!files.length) return;
    setBusy(true);
    const room = max - latest.current.length;
    const added = [];
    const problems = [];
    for (const file of files.slice(0, room)) {
      try { added.push(await preparePhoto(file)); } catch (error) { problems.push(error.message); }
    }
    if (files.length > room) problems.push(`${max} photos au maximum.`);
    setBusy(false);
    if (added.length) onChange([...latest.current, ...added]);
    if (problems.length) toast({ title: 'Photo non ajoutée', description: [...new Set(problems)].join(' '), variant: 'destructive' });
  };

  const remove = (photo) => {
    releasePhoto(photo);
    onChange(photos.filter((item) => item.id !== photo.id));
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{photos.length} / {max}</p>
      </div>

      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-3 pt-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative">
              <img src={photo.previewUrl} alt={`Photo ${index + 1}`} className="h-20 w-20 rounded-lg border border-border object-cover" />
              <button
                type="button"
                aria-label={`Retirer la photo ${index + 1}`}
                onClick={() => remove(photo)}
                disabled={disabled}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-destructive shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {hasCamera() && (
          <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5 whitespace-nowrap px-2 sm:flex-none sm:px-3" disabled={disabled || busy || full} onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4 shrink-0" /> Prendre une photo
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5 whitespace-nowrap px-2 sm:flex-none sm:px-3" disabled={disabled || busy || full} onClick={() => importRef.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 shrink-0" />} Importer
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={add} className="hidden" tabIndex={-1} aria-hidden="true" data-photo-input="camera" />
      <input ref={importRef} type="file" accept="image/*" multiple onChange={add} className="hidden" tabIndex={-1} aria-hidden="true" data-photo-input="import" />
    </div>
  );
};

export default PhotoPicker;
