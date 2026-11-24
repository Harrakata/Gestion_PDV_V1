import { useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { photoUrls } from '@/lib/photos';

// Hors-ligne, l'adresse est connue avant l'envoi du fichier : l'image peut manquer un moment.
const Picture = ({ src, alt, className }) => {
  const [missing, setMissing] = useState(false);
  return missing ? (
    <span className={`flex flex-col items-center justify-center gap-1 bg-muted p-1 text-center text-xs text-muted-foreground ${className}`}>
      <ImageOff className="h-5 w-5" aria-hidden="true" /> Photo indisponible
    </span>
  ) : <img src={src} alt={alt} loading="lazy" onError={() => setMissing(true)} className={className} />;
};

/**
 * Photos enregistrées, agrandies au toucher.
 * @param {'thumbs'|'button'} p.variant  miniatures, ou simple bouton « n photo(s) »
 */
const PhotoGallery = ({ photos, variant = 'thumbs', title = 'Photos', className = '' }) => {
  const urls = photoUrls(photos);
  const [index, setIndex] = useState(null);
  if (!urls.length) return null;
  const move = (step) => setIndex((current) => (current + step + urls.length) % urls.length);

  return (
    // Une photo peut se trouver dans une carte cliquable : le toucher ne doit pas l'ouvrir aussi.
    <div className={className} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {variant === 'button' ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary" onClick={() => setIndex(0)} aria-label={`Voir ${urls.length} photo(s)`}>
          <Camera className="h-3.5 w-3.5" /> {urls.length}
        </Button>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={title}>
          {urls.map((url, i) => (
            <li key={url}>
              <button
                type="button"
                aria-label={`Agrandir la photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className="block overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Picture src={url} alt={`Photo ${i + 1}`} className="h-16 w-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={index !== null} onOpenChange={(open) => { if (!open) setIndex(null); }}>
        <DialogContent className="flex flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Photo {(index ?? 0) + 1} sur {urls.length}</DialogDescription>
          </DialogHeader>
          {index !== null && (
            <a href={urls[index]} target="_blank" rel="noreferrer" title="Ouvrir en taille réelle" className="flex min-h-0 justify-center">
              <Picture key={urls[index]} src={urls[index]} alt={`Photo ${index + 1}`} className="max-h-[60vh] min-h-24 w-auto max-w-full rounded-lg object-contain" />
            </a>
          )}
          {urls.length > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button type="button" variant="outline" size="icon" aria-label="Photo précédente" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Photo suivante" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotoGallery;
