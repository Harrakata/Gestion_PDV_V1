import { useState, useEffect } from 'react';
import { describeError } from '@/lib/errors';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/Combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  createTicket, fetchTicketAgences, fetchTicketTerminals, categoryTerminalKind,
  TICKET_CATEGORY_OPTIONS, TICKET_PRIORITY_OPTIONS, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_ROLES,
} from '@/lib/tickets';
import PhotoPicker from '@/components/photos/PhotoPicker';
import { usePhotoSelection } from '@/hooks/usePhotoSelection';
import { PHOTO_FOLDERS, photoUploadMessage, uploadPhotos } from '@/lib/photos';
import { logAudit, AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/lib/auditLog';

const NO_TERMINAL = '__none__';

/** Dialog de déclaration d'un ticket par un déclarant (guichetière / chef d'agence / technicien). */
const TicketCreateDialog = ({ open, onOpenChange, declarant, spaceKey, onCreated }) => {
  const { toast } = useToast();
  const [terminaux, setTerminaux] = useState([]);
  const [saving, setSaving] = useState(false);
  const empty = {
    titre: '', description: '', categorie: TICKET_CATEGORIES.TERMINAL,
    priorite: TICKET_PRIORITIES.NORMALE, terminal_id: NO_TERMINAL, agence: '',
  };
  const [form, setForm] = useState(empty);
  const [photos, setPhotos, clearPhotos] = usePhotoSelection();

  // Un technicien n'est rattaché à aucune agence : il indique celle de l'incident.
  const choosesAgence = declarant?.role === TICKET_ROLES.TECHNICIEN && !declarant?.agence_nom;
  const agenceNom = choosesAgence ? form.agence : declarant?.agence_nom;
  const [agences, setAgences] = useState([]);
  useEffect(() => {
    if (open && choosesAgence) fetchTicketAgences().then(setAgences).catch(() => setAgences([]));
  }, [open, choosesAgence]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setTerminaux([]);
    if (agenceNom) {
      fetchTicketTerminals(agenceNom)
        .then((rows) => { if (!cancelled) setTerminaux(rows); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [open, agenceNom]);

  // Cascade : la catégorie détermine le type de terminal proposé (fixe / mobi).
  const expectedKind = categoryTerminalKind(form.categorie); // 'fixe' | 'mobi' | null
  const terminalOptions = expectedKind ? terminaux.filter((t) => t.kind === expectedKind) : [];

  // Réinitialise le terminal quand la catégorie change (cascade).
  const setCategorie = (categorie) => setForm((f) => ({ ...f, categorie, terminal_id: NO_TERMINAL }));

  const submit = async () => {
    if (!form.titre.trim()) {
      toast({ title: 'Titre requis', description: 'Indiquez un résumé du problème.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const terminal = expectedKind ? terminalOptions.find((t) => String(t.id) === form.terminal_id) : null;
    const upload = await uploadPhotos(photos, PHOTO_FOLDERS.TICKET);
    const { data, error, photosMissing } = await createTicket({
      photos: upload.urls,
      titre: form.titre.trim(),
      description: form.description?.trim() || null,
      categorie: form.categorie,
      priorite: form.priorite,
      agence_nom: agenceNom || null,
      terminal_id: terminal?.id || null,
      terminal_reference: terminal?.reference || null,
      terminal_kind: terminal ? expectedKind : null,
      createur_role: declarant.role || null,
      createur_id: declarant.id || null,
      createur_nom: declarant.nom || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Échec de la création', description: describeError(error, 'TicketCreateDialog'), variant: 'destructive' });
      return;
    }
    const photoMessage = photoUploadMessage({ ...upload, columnMissing: photosMissing });
    toast({
      title: 'Ticket créé',
      description: [data?.code ? `Référence ${data.code}.` : 'Incident signalé.', photoMessage].filter(Boolean).join(' '),
      className: photoMessage ? 'bg-warning text-warning-foreground' : undefined,
    });
    logAudit({
      space: spaceKey,
      actorId: declarant.id, actorName: declarant.nom, actorRole: declarant.role,
      action: AUDIT_ACTIONS.CREATE, entity: AUDIT_ENTITIES.TICKET,
      entityId: data?.id, entityLabel: data?.code || form.titre,
      details: { categorie: form.categorie, priorite: form.priorite, agence: agenceNom || null, photos: photosMissing ? 0 : upload.urls.length },
    });
    setForm(empty);
    clearPhotos();
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Signaler un incident</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Titre</Label>
            <Input value={form.titre} onChange={(e) => setForm((f) => ({ ...f, titre: e.target.value }))} placeholder="Ex. Terminal ne s'allume plus" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select value={form.categorie} onValueChange={setCategorie}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORY_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select value={form.priorite} onValueChange={(v) => setForm((f) => ({ ...f, priorite: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITY_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {choosesAgence && (
            <div className="space-y-1.5">
              <Label htmlFor="ticket-agence">Agence concernée (facultatif)</Label>
              <Combobox
                id="ticket-agence"
                modal
                options={agences.map((nom) => ({ value: nom, label: nom }))}
                value={form.agence}
                onSelect={(agence) => setForm((f) => ({ ...f, agence, terminal_id: NO_TERMINAL }))}
                placeholder="Choisir une agence"
                searchPlaceholder="Rechercher une agence..."
                emptyText="Aucune agence trouvée."
                disabled={saving}
              />
            </div>
          )}
          {expectedKind && (
            <div className="space-y-1.5">
              <Label>{expectedKind === 'mobi' ? 'Terminal Mobi concerné (optionnel)' : 'Terminal concerné (optionnel)'}</Label>
              <Select value={form.terminal_id} onValueChange={(v) => setForm((f) => ({ ...f, terminal_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TERMINAL}>Aucun</SelectItem>
                  {terminalOptions.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.reference}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {terminalOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {agenceNom ? `Aucun terminal ${expectedKind === 'mobi' ? 'Mobi' : 'fixe'} rattaché à cette agence.` : 'Choisissez une agence pour voir ses terminaux.'}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Description (facultatif)</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} placeholder="Détaillez le problème…" />
          </div>
          <PhotoPicker photos={photos} onChange={setPhotos} disabled={saving} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TicketCreateDialog;
