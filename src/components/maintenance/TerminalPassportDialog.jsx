import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Cpu,
  Download,
  History,
  MapPin,
  Package2,
  QrCode,
  ShieldCheck,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import EmptyState from '@/components/ui/empty-state';
import { supabase } from '@/lib/supabaseClient';
import {
  formatMaintenanceDateTime,
  getMaintenanceInterventionStatusTone,
  getMaintenanceInterventionTypeLabel,
} from '@/lib/maintenanceMonitoring';

const EQUIPMENT_TABLES = {
  imprimante: 'equipments_imprimantes',
  lecteur: 'equipments_lecteurs',
  ecran: 'equipments_ecrans',
  afficheur: 'equipments_afficheurs',
  buc: 'equipments_bucs',
  alimentation: 'equipments_alimentations',
  bouton_marche_arret: 'equipments_boutons_marche_arret',
  afficheur_terminal: 'equipments_afficheurs_terminal',
  circuit_afficheur_client: 'equipments_circuits_afficheur_client',
  circuit_bac_uc: 'equipments_circuits_bac_uc',
  carte_mere_bac_uc: 'equipments_cartes_meres_bac_uc',
  ssd: 'equipments_ssd',
};

const scoreTone = (score) => {
  if (score >= 80) return { label: 'Fiable', tone: 'success' };
  if (score >= 55) return { label: 'À surveiller', tone: 'warning' };
  return { label: 'Prioritaire', tone: 'danger' };
};

const Detail = ({ label, value }) => (
  <div className="min-w-0 border-b border-border/70 py-3 last:border-b-0">
    <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-medium text-foreground" title={String(value || '')}>{value || 'N/A'}</p>
  </div>
);

const TerminalPassportDialog = ({
  open,
  onOpenChange,
  group,
  terminal,
  agence,
  interventions = [],
  initialTab = 'overview',
  onOpenWorkshop,
}) => {
  const { toast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [assembledTerminal, setAssembledTerminal] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState('');
  const [diagnostic, setDiagnostic] = useState({ loading: false, error: '', pannes: [], checks: {} });
  const [selectedPanneId, setSelectedPanneId] = useState('');
  const [checkedIds, setCheckedIds] = useState(new Set());

  const terminalInterventions = useMemo(
    () => interventions
      .filter((item) => String(item.terminal_id) === String(group?.terminalId))
      .sort((a, b) => new Date(b.date_intervention || 0) - new Date(a.date_intervention || 0)),
    [group?.terminalId, interventions]
  );

  const health = useMemo(() => {
    const completed = terminalInterventions.filter((item) => item.statut !== 'Annulée');
    const curativeRecent = completed.filter((item) => {
      if (item.type_intervention !== 'curative') return false;
      const date = new Date(item.date_intervention || 0).getTime();
      return date && Date.now() - date <= 180 * 24 * 60 * 60 * 1000;
    }).length;
    const inProgress = completed.filter((item) => item.statut === 'En cours').length;
    const overdueComponents = group?.sousEnsembles?.filter(
      (item) => item.followUp?.label !== 'Maintenance à jour'
    ).length || 0;
    const score = Math.max(0, 100 - Math.min(35, overdueComponents * 5) - Math.min(30, curativeRecent * 10) - Math.min(20, inProgress * 10));
    return { score, curativeRecent, inProgress, overdueComponents, tone: scoreTone(score) };
  }, [group?.sousEnsembles, terminalInterventions]);

  const passportUrl = useMemo(() => {
    if (!group || typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('terminal', String(group.terminalId));
    url.searchParams.set('passport', '1');
    url.hash = '';
    return url.toString();
  }, [group]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSelectedComponent(group?.sousEnsembles?.[0]?.sousEnsembleReference || '');
    setSelectedPanneId('');
    setCheckedIds(new Set());
  }, [group, initialTab, open]);

  useEffect(() => {
    if (!open || !terminal) return;
    let active = true;

    const loadAssembledTerminal = async () => {
      let response = await supabase
        .from('terminaux_assembles')
        .select('reference, mac_address, identifiant, numero_secu, statut')
        .eq('reference', terminal.reference)
        .maybeSingle();

      if (!response.data && !response.error && terminal.id) {
        response = await supabase
          .from('terminaux_assembles')
          .select('reference, mac_address, identifiant, numero_secu, statut')
          .eq('terminal_id', terminal.id)
          .maybeSingle();
      }

      if (active) setAssembledTerminal(response.data || null);
    };

    loadAssembledTerminal();
    return () => { active = false; };
  }, [open, terminal]);

  const selectedRow = useMemo(
    () => group?.sousEnsembles?.find((row) => row.sousEnsembleReference === selectedComponent) || null,
    [group?.sousEnsembles, selectedComponent]
  );

  useEffect(() => {
    if (!open || tab !== 'diagnostic' || !selectedRow) return;
    let active = true;

    const loadDiagnostic = async () => {
      const table = EQUIPMENT_TABLES[selectedRow.sousEnsembleKey];
      setDiagnostic({ loading: true, error: '', pannes: [], checks: {} });
      setSelectedPanneId('');
      setCheckedIds(new Set());

      if (!table) {
        setDiagnostic({ loading: false, error: 'Aucun référentiel de diagnostic pour ce sous-ensemble.', pannes: [], checks: {} });
        return;
      }

      const { data: equipment, error: equipmentError } = await supabase
        .from(table)
        .select('reference, modele')
        .eq('reference', selectedRow.sousEnsembleReference)
        .maybeSingle();

      if (!active) return;
      if (equipmentError || !equipment?.modele) {
        setDiagnostic({ loading: false, error: 'Le modèle de ce sous-ensemble n’est pas renseigné.', pannes: [], checks: {} });
        return;
      }

      const { data: model } = await supabase
        .from('modeles_sous_ensembles')
        .select('id')
        .eq('nom', equipment.modele)
        .maybeSingle();

      if (!model?.id) {
        setDiagnostic({ loading: false, error: 'Ce modèle n’a pas encore de guide de diagnostic.', pannes: [], checks: {} });
        return;
      }

      const { data: modelPieces } = await supabase
        .from('modeles_pieces')
        .select('piece_id, piece:pieces_sous_ensembles(id, nom, reference)')
        .eq('modele_id', model.id);
      const pieceIds = (modelPieces || []).map((item) => item.piece_id).filter(Boolean);

      if (pieceIds.length === 0) {
        setDiagnostic({ loading: false, error: 'Aucune pièce de diagnostic n’est associée à ce modèle.', pannes: [], checks: {} });
        return;
      }

      const pieceById = (modelPieces || []).reduce((map, item) => {
        if (item.piece_id) map[item.piece_id] = item.piece;
        return map;
      }, {});
      const { data: pannes, error: pannesError } = await supabase
        .from('pieces_pannes')
        .select('*')
        .in('piece_id', pieceIds)
        .order('poids', { ascending: false });

      if (pannesError || !pannes?.length) {
        setDiagnostic({ loading: false, error: 'Aucun symptôme n’est configuré pour les pièces de ce modèle.', pannes: [], checks: {} });
        return;
      }

      const { data: checks } = await supabase
        .from('pieces_pannes_checks')
        .select('*, piece:pieces_sous_ensembles(id, nom, reference)')
        .in('panne_id', pannes.map((item) => item.id))
        .order('ordre');
      const checksByPanne = (checks || []).reduce((map, check) => {
        if (!map[check.panne_id]) map[check.panne_id] = [];
        map[check.panne_id].push(check);
        return map;
      }, {});
      const enrichedPannes = pannes.map((panne) => ({ ...panne, piece: pieceById[panne.piece_id] || null }));

      if (active) setDiagnostic({ loading: false, error: '', pannes: enrichedPannes, checks: checksByPanne });
    };

    loadDiagnostic();
    return () => { active = false; };
  }, [open, selectedRow, tab]);

  const selectedPanne = diagnostic.pannes.find((item) => String(item.id) === String(selectedPanneId));
  const selectedChecks = diagnostic.checks[selectedPanneId] || [];
  const suggestedParts = useMemo(() => {
    const seen = new Set();
    return selectedChecks
      .filter((check) => checkedIds.has(check.id) && check.piece)
      .map((check) => check.piece)
      .filter((piece) => {
        if (seen.has(piece.id)) return false;
        seen.add(piece.id);
        return true;
      });
  }, [checkedIds, selectedChecks]);

  const copyPassportLink = async () => {
    await navigator.clipboard.writeText(passportUrl);
    toast({ title: 'Lien du passeport copié' });
  };

  const downloadQrCode = () => {
    const svg = document.getElementById(`terminal-passport-qr-${group?.terminalId}`);
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `passeport-${group?.terminalReference || 'terminal'}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!group || !terminal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="terminal-passport-dialog w-[calc(100vw-1rem)] max-w-[72rem] min-w-0 gap-0 overflow-hidden p-0 sm:w-[min(96vw,72rem)]">
        <DialogHeader className="min-w-0 border-b border-primary/15 bg-primary/5 px-4 py-4 pr-12 sm:px-5 sm:pr-14">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 break-words text-xl text-primary">
                <ShieldCheck className="h-5 w-5 shrink-0" />
                Passeport du terminal {group.terminalReference}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Identité, configuration, fiabilité et historique dans une seule fiche.
              </p>
            </div>
            <Badge variant={health.tone.tone}>{health.tone.label} · {health.score}/100</Badge>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="min-h-0 min-w-0 w-full">
          <div className="min-w-0 border-b bg-card/60 px-3 py-3 sm:px-4">
            <TabsList className="grid h-auto w-full min-w-0 grid-cols-2 gap-1 sm:grid-cols-4">
              <TabsTrigger className="min-w-0 whitespace-normal px-2 text-xs sm:text-sm" value="overview"><Activity className="mr-1.5 h-4 w-4 shrink-0" />Vue d’ensemble</TabsTrigger>
              <TabsTrigger className="min-w-0 whitespace-normal px-2 text-xs sm:text-sm" value="components"><Cpu className="mr-1.5 h-4 w-4 shrink-0" />Sous-ensembles</TabsTrigger>
              <TabsTrigger className="min-w-0 whitespace-normal px-2 text-xs sm:text-sm" value="history"><History className="mr-1.5 h-4 w-4 shrink-0" />Historique</TabsTrigger>
              <TabsTrigger className="min-w-0 whitespace-normal px-2 text-xs sm:text-sm" value="diagnostic"><Stethoscope className="mr-1.5 h-4 w-4 shrink-0" />Diagnostic</TabsTrigger>
            </TabsList>
          </div>

          <div className="min-w-0 max-h-[68vh] overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
            <TabsContent value="overview" className="mt-0 space-y-5">
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="terminal-passport-details grid min-w-0 gap-4 md:grid-cols-2">
                  <section className="rounded-lg border bg-card/75 px-4">
                    <h3 className="flex items-center gap-2 border-b py-3 font-semibold"><Clipboard className="h-4 w-4 text-primary" />Identité</h3>
                    <Detail label="Référence" value={group.terminalReference} />
                    <Detail label="Type / position" value={`${group.terminalType} · ${group.terminalPosition}`} />
                    <Detail label="Adresse IP" value={terminal.adresse_ip} />
                    <Detail label="MAC address" value={assembledTerminal?.mac_address} />
                    <Detail label="Identifiant / N° sécurité" value={[assembledTerminal?.identifiant, assembledTerminal?.numero_secu].filter(Boolean).join(' · ')} />
                  </section>
                  <section className="rounded-lg border bg-card/75 px-4">
                    <h3 className="flex items-center gap-2 border-b py-3 font-semibold"><MapPin className="h-4 w-4 text-primary" />Affectation</h3>
                    <Detail label="Région" value={group.regionNom} />
                    <Detail label="Agence" value={group.agenceNom} />
                    <Detail label="Code PDV" value={agence?.codePDV} />
                    <Detail label="Adresse" value={agence?.adresse} />
                    <Detail label="Statut" value={terminal.statut || assembledTerminal?.statut} />
                  </section>
                </div>

                <aside className="flex flex-col items-center justify-center rounded-lg border border-primary/15 bg-card/75 p-4 text-center">
                  <QrCode className="mb-2 h-5 w-5 text-primary" />
                  <p className="font-semibold">Accès rapide sécurisé</p>
                  <p className="mb-3 text-xs text-muted-foreground">Le QR contient uniquement le lien et l’identifiant du terminal.</p>
                  <div className="rounded-lg border bg-card p-2">
                    <QRCodeSVG id={`terminal-passport-qr-${group.terminalId}`} value={passportUrl} size={154} level="M" marginSize={2} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyPassportLink}><Copy className="mr-2 h-4 w-4" />Copier</Button>
                    <Button variant="outline" size="sm" onClick={downloadQrCode}><Download className="mr-2 h-4 w-4" />QR</Button>
                  </div>
                </aside>
              </div>

              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-card/70 p-4"><p className="text-xs text-muted-foreground">Indice de fiabilité</p><p className="mt-1 text-2xl font-bold text-primary">{health.score}/100</p></div>
                <div className="rounded-lg border bg-card/70 p-4"><p className="text-xs text-muted-foreground">Sous-ensembles à traiter</p><p className="mt-1 text-2xl font-bold text-destructive">{health.overdueComponents}</p></div>
                <div className="rounded-lg border bg-card/70 p-4"><p className="text-xs text-muted-foreground">Curatives sur 6 mois</p><p className="mt-1 text-2xl font-bold text-warning-muted-foreground">{health.curativeRecent}</p></div>
                <div className="rounded-lg border bg-card/70 p-4"><p className="text-xs text-muted-foreground">Interventions en cours</p><p className="mt-1 text-2xl font-bold">{health.inProgress}</p></div>
              </section>
            </TabsContent>

            <TabsContent value="components" className="mt-0">
              <div className="overflow-x-auto rounded-lg border bg-card/75">
                <div className="min-w-[42rem]">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(10rem,1fr)] gap-3 border-b bg-muted/50 px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
                  <span>Sous-ensemble</span><span>Référence</span><span>État maintenance</span>
                </div>
                {group.sousEnsembles.map((row) => (
                  <div key={`${row.sousEnsembleKey}-${row.sousEnsembleReference}`} className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_minmax(10rem,1fr)] items-center gap-3 border-b px-4 py-3 last:border-b-0">
                    <span className="font-medium">{row.sousEnsembleLabel}</span>
                    <span className="font-mono text-sm">{row.sousEnsembleReference}</span>
                    <StatusBadge tone={row.followUp.tone} className="w-fit">{row.followUp.label}</StatusBadge>
                  </div>
                ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-0 space-y-3">
              {terminalInterventions.length === 0 ? (
                <EmptyState compact title="Aucune intervention enregistrée" />
              ) : terminalInterventions.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-lg border bg-card/75 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{getMaintenanceInterventionTypeLabel(item.type_intervention)}</span>
                      <StatusBadge tone={getMaintenanceInterventionStatusTone(item.statut)}>{item.statut || 'N/A'}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.sous_ensemble || 'Terminal'} · {item.description_panne || item.commentaire || 'Sans commentaire'}</p>
                  </div>
                  <span className="shrink-0 text-sm font-medium">{formatMaintenanceDateTime(item.date_intervention)}</span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="diagnostic" className="mt-0 space-y-5">
              <div className="flex flex-col gap-3 rounded-lg border bg-card/75 p-4 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-semibold">Sous-ensemble à diagnostiquer</label>
                  <Select value={selectedComponent} onValueChange={setSelectedComponent}>
                    <SelectTrigger><SelectValue placeholder="Choisir un sous-ensemble" /></SelectTrigger>
                    <SelectContent>
                      {group.sousEnsembles.map((row) => (
                        <SelectItem key={row.sousEnsembleReference} value={row.sousEnsembleReference}>
                          {row.sousEnsembleLabel} · {row.sousEnsembleReference}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-primary/15 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
                  Les suggestions proviennent du modèle et du référentiel de réparation.
                </div>
              </div>

              {diagnostic.loading ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Chargement du guide de diagnostic…</div>
              ) : diagnostic.error ? (
                <div className="rounded-lg border border-warning/30 bg-warning-muted p-5 text-sm text-warning-muted-foreground">
                  <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Guide incomplet</div>
                  <p className="mt-2">{diagnostic.error}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={onOpenWorkshop}><Wrench className="mr-2 h-4 w-4" />Configurer dans l’atelier</Button>
                </div>
              ) : !selectedPanne ? (
                <div>
                  <h3 className="mb-3 font-semibold">1. Sélectionnez le symptôme observé</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {diagnostic.pannes.map((panne) => (
                      <button key={panne.id} type="button" onClick={() => { setSelectedPanneId(String(panne.id)); setCheckedIds(new Set()); }} className="rounded-lg border bg-card/75 p-4 text-left transition hover:border-primary hover:bg-primary/5">
                        <div className="flex items-start justify-between gap-3"><span className="font-medium">{panne.description}</span><Activity className="h-4 w-4 shrink-0 text-primary" /></div>
                        <p className="mt-2 text-xs text-muted-foreground">Pièce liée : {panne.piece?.nom || 'non précisée'} · Priorité {panne.poids || 3}/5</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase text-primary">Symptôme retenu</p><p className="font-semibold">{selectedPanne.description}</p></div>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedPanneId(''); setCheckedIds(new Set()); }}>Changer</Button>
                  </div>
                  <h3 className="font-semibold">2. Effectuez les vérifications</h3>
                  {selectedChecks.length === 0 ? (
                    <EmptyState compact title="Aucune vérification détaillée n’est encore configurée" />
                  ) : selectedChecks.map((check, index) => {
                    const checked = checkedIds.has(check.id);
                    return (
                      <button key={check.id} type="button" onClick={() => setCheckedIds((previous) => {
                        const next = new Set(previous);
                        if (next.has(check.id)) next.delete(check.id); else next.add(check.id);
                        return next;
                      })} className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition ${checked ? 'border-success/30 bg-success-muted' : 'bg-card/75 hover:border-primary/40'}`}>
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-success bg-success text-success-foreground' : 'border-border'}`}>{checked && <Check className="h-3 w-3" />}</span>
                        <span className="flex-1"><span className="text-sm font-medium">{index + 1}. {check.description_verification}</span>{check.piece && <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Package2 className="h-3 w-3" />{check.piece.nom}</span>}</span>
                      </button>
                    );
                  })}
                  {checkedIds.size > 0 && (
                    <div className="rounded-lg border border-success/30 bg-success-muted p-4">
                      <p className="flex items-center gap-2 font-semibold text-success-muted-foreground"><CheckCircle2 className="h-4 w-4" />Résultat progressif</p>
                      <p className="mt-1 text-sm text-success-muted-foreground">{checkedIds.size}/{selectedChecks.length} vérification(s) effectuée(s).</p>
                      {suggestedParts.length > 0 && <p className="mt-2 text-sm text-success-muted-foreground">Pièce(s) à contrôler : {suggestedParts.map((piece) => piece.nom).join(', ')}.</p>}
                      <Button size="sm" className="mt-4" onClick={onOpenWorkshop}><Wrench className="mr-2 h-4 w-4" />Poursuivre dans l’atelier</Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TerminalPassportDialog;
