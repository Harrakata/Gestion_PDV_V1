import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeError } from '@/lib/errors';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import EmptyState from '@/components/ui/empty-state';
import { getStockDefectueuxRecordIds, regrouperStockDefectueuxActif } from '@/lib/stockDefectueux';
import { AlertTriangle, CheckCircle2, HelpCircle, Package2, Wrench, ArrowRight, FlaskConical, ChevronDown, ChevronRight, ChevronLeft, Sparkles, CheckCheck, Search, X, Check, ListChecks, Stethoscope, MessageSquare, CalendarDays } from 'lucide-react';
import { appLocale } from '@/i18n/language';

const SOUS_ENSEMBLE_LABELS = {
  imprimante: 'Imprimante',
  lecteur: 'Lecteur',
  ecran: 'Écran',
  afficheur: 'Afficheur client',
  buc: 'BUC',
  carrosserie: 'Carrosserie',
  alimentation: 'Alimentation',
  bouton_marche_arret: 'Bouton marche/arrêt',
  afficheur_terminal: 'Afficheur',
  circuit_afficheur_client: 'Circuit afficheur client',
  circuit_bac_uc: 'Circuit BAC UC',
  carte_mere_bac_uc: 'Carte mère BAC UC',
  ssd: 'SSD',
};

const STATUT_CONFIG = {
  defectueux: { label: 'Défectueux', tone: 'danger' },
  assigne: { label: 'Assigné', tone: 'info' },
  a_tester: { label: 'À tester', tone: 'warning' },
  repare: { label: 'Réparé', tone: 'success' },
};

/** État de stock d'une pièce (pastille) — même rendu dans la liste et dans la fiche. */
const getStockState = (sp) => {
  if (!sp) return { tone: 'bg-muted text-muted-foreground', label: 'Non suivi', level: 'untracked' };
  if (sp.quantite === 0) return { tone: 'bg-destructive/10 text-destructive', label: 'Rupture', level: 'out' };
  if (sp.quantite <= (sp.seuil_alerte || 2)) return { tone: 'bg-warning-muted text-warning-muted-foreground', label: `Stock bas · ${sp.quantite}`, level: 'low' };
  return { tone: 'bg-success-muted text-success-muted-foreground', label: `En stock · ${sp.quantite}`, level: 'ok' };
};

const StatutBadge = ({ statut }) => {
  const cfg = STATUT_CONFIG[statut] || { label: statut, tone: 'neutral' };
  return <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>;
};

/**
 * @param {object} props
 * @param {boolean} [props.canManage]
 * @param {boolean} [props.assignedOnly]  Espace technicien : ne montrer QUE les
 *   sous-ensembles assignés à `technicienId` (aucun si l'identifiant est inconnu).
 * @param {string|number} [props.technicienId]
 */
const ReparationTerminauxTab = ({ canManage = true, assignedOnly = false, technicienId = null }) => {
  const { toast } = useToast();
  const [stock, setStock] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [stockPieces, setStockPieces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedItem, setSelectedItem] = useState(null);
  const [itemPieces, setItemPieces] = useState([]);
  const [pannes, setPannes] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [selectedPieceHelp, setSelectedPieceHelp] = useState(null);

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [replacingPiece, setReplacingPiece] = useState(null);
  const [replacePieceId, setReplacePieceId] = useState('');

  const [filterType, setFilterType] = useState('__all__');
  const [filterTerminal, setFilterTerminal] = useState('__all__');
  const [pieceSearch, setPieceSearch] = useState('');

  const [expandedItems, setExpandedItems] = useState(new Set());
  const [itemPiecesCache, setItemPiecesCache] = useState({});
  const [loadingExpandIds, setLoadingExpandIds] = useState(new Set());
  // { [itemId]: { [pieceId]: 'nettoyage' | 'remplacement' } }
  const [treatedPieces, setTreatedPieces] = useState({});

  const [helpTab, setHelpTab] = useState('guide');
  const [panneChecksMap, setPanneChecksMap] = useState({});
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardPanne, setWizardPanne] = useState(null);
  const [wizardCheckedIds, setWizardCheckedIds] = useState(new Set());
  const [wizardFilter, setWizardFilter] = useState(null);
  const [wizardFromSEHelp, setWizardFromSEHelp] = useState(false);

  const [isSEHelpOpen, setIsSEHelpOpen] = useState(false);
  const [seHelpItem, setSeHelpItem] = useState(null);
  const [seHelpPannes, setSeHelpPannes] = useState([]);
  const [seHelpChecksMap, setSeHelpChecksMap] = useState({});
  const [seDiagnosticPanne, setSeDiagnosticPanne] = useState(null);
  const [seDiagnosticCheckedIds, setSeDiagnosticCheckedIds] = useState(new Set());
  const [seDiagnosticView, setSeDiagnosticView] = useState('guide');
  const [seDiagnosticProcedures, setSeDiagnosticProcedures] = useState([]);
  const [isDiagnosticDocsLoading, setIsDiagnosticDocsLoading] = useState(false);
  const [isDiagnosticLoading, setIsDiagnosticLoading] = useState(false);
  const [diagnosticSessions, setDiagnosticSessions] = useState({});

  const EQUIP_TABLE_MAP = {
    imprimante: 'equipments_imprimantes',
    lecteur: 'equipments_lecteurs',
    ecran: 'equipments_ecrans',
    afficheur: 'equipments_afficheurs',
    buc: 'equipments_bucs',
    carrosserie: 'equipments_carrosseries',
    alimentation: 'equipments_alimentations',
    bouton_marche_arret: 'equipments_boutons_marche_arret',
    afficheur_terminal: 'equipments_afficheurs_terminal',
    circuit_afficheur_client: 'equipments_circuits_afficheur_client',
    circuit_bac_uc: 'equipments_circuits_bac_uc',
    carte_mere_bac_uc: 'equipments_cartes_meres_bac_uc',
    ssd: 'equipments_ssd',
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    let stockQuery = supabase
      .from('stock_defectueux')
      .select('*, agence:agences(nom), intervention:interventions_maintenance(id, type_intervention, commentaire, description_panne, code_panne:codes_pannes(code, libelle), code_intervention:codes_interventions(code, libelle))')
      .neq('statut', 'repare')
      .order('date_entree', { ascending: false });

    if (assignedOnly) {
      // Technicien : uniquement ses sous-ensembles assignés. Sans identifiant
      // (profil non encore chargé), on n'affiche rien plutôt que tout le stock.
      stockQuery = technicienId
        ? stockQuery.eq('technicien_id', String(technicienId))
        : Promise.resolve({ data: [], error: null });
    }

    const [sRes, pRes, spRes] = await Promise.all([
      stockQuery,
      supabase.from('pieces_sous_ensembles').select('*').order('nom'),
      supabase.from('stock_pieces').select('*, piece:pieces_sous_ensembles(nom, reference)'),
    ]);

    let stockData = sRes.data || [];

    if (!sRes.error && stockData.length > 0) {
      // Step 1: get modele name (string) from equipment tables per reference
      const byType = {};
      for (const item of stockData) {
        const type = item.type_sous_ensemble;
        if (!byType[type]) byType[type] = [];
        if (item.reference_sous_ensemble) byType[type].push(item.reference_sous_ensemble);
      }
      const refToModeleNom = {};
      await Promise.all(
        Object.entries(byType).map(async ([type, refs]) => {
          const table = EQUIP_TABLE_MAP[type];
          if (!table || refs.length === 0) return;
          const { data } = await supabase.from(table).select('reference, modele').in('reference', refs);
          for (const eq of (data || [])) refToModeleNom[eq.reference] = eq.modele;
        })
      );

      // Step 2: resolve modele name → modeles_sous_ensembles.id
      const uniqueNoms = [...new Set(Object.values(refToModeleNom).filter(Boolean))];
      const nomToId = {};
      if (uniqueNoms.length > 0) {
        const { data: modeles } = await supabase
          .from('modeles_sous_ensembles')
          .select('id, nom')
          .in('nom', uniqueNoms);
        for (const m of (modeles || [])) nomToId[m.nom] = m.id;
      }

      stockData = stockData.map(item => {
        if (item.modele_id) return item;
        const nom = refToModeleNom[item.reference_sous_ensemble];
        return { ...item, modele_id: nom ? (nomToId[nom] ?? null) : null };
      });
    }

    if (!sRes.error) { setStock(regrouperStockDefectueuxActif(stockData)); setItemPiecesCache({}); }
    if (!pRes.error) setPieces(pRes.data || []);
    if (!spRes.error) setStockPieces(spRes.data || []);
    setIsLoading(false);
  }, [assignedOnly, technicienId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const stockPiecesById = useMemo(() => stockPieces.reduce((a, s) => { a[s.piece_id] = s; return a; }, {}), [stockPieces]);

  const filteredStock = useMemo(() =>
    stock
      .filter(s => filterType === '__all__' || s.type_sous_ensemble === filterType)
      .filter(s => filterTerminal === '__all__' || s.type_terminal === filterTerminal),
    [stock, filterType, filterTerminal]
  );

  const pieceSearchLower = pieceSearch.trim().toLowerCase();

  const wizardChecks = useMemo(
    () => (wizardPanne ? (panneChecksMap[wizardPanne.id] || []) : []),
    [wizardPanne, panneChecksMap]
  );

  const uniquePiecesFromChecked = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const checkId of wizardCheckedIds) {
      const check = wizardChecks.find(c => c.id === checkId);
      if (check?.piece && !seen.has(check.piece.id)) {
        seen.add(check.piece.id);
        result.push(check.piece);
      }
    }
    return result;
  }, [wizardCheckedIds, wizardChecks]);

  const seDiagnosticChecks = useMemo(
    () => (seDiagnosticPanne ? (seHelpChecksMap[seDiagnosticPanne.id] || []) : []),
    [seDiagnosticPanne, seHelpChecksMap]
  );

  const seDiagnosticPieces = useMemo(() => {
    const seen = new Set();
    const checkedPieces = seDiagnosticChecks
      .filter(check => seDiagnosticCheckedIds.has(check.id) && check.piece)
      .map(check => check.piece);
    const candidates = seDiagnosticCheckedIds.size > 0
      ? [seDiagnosticPanne?.piece, ...checkedPieces].filter(Boolean)
      : [];
    return candidates
      .filter(piece => {
        if (seen.has(piece.id)) return false;
        seen.add(piece.id);
        return true;
      });
  }, [seDiagnosticCheckedIds, seDiagnosticChecks, seDiagnosticPanne]);

  // Auto-expand items whose cached pieces match the search, and trigger load for uncached ones
  useEffect(() => {
    if (!pieceSearchLower) return;
    filteredStock.forEach(item => {
      const cached = itemPiecesCache[item.id];
      if (cached === undefined) {
        // trigger load so we can search inside
        toggleExpand(item);
      } else if (cached.some(mp =>
        mp.piece?.nom?.toLowerCase().includes(pieceSearchLower) ||
        mp.piece?.reference?.toLowerCase().includes(pieceSearchLower)
      )) {
        setExpandedItems(prev => { const n = new Set(prev); n.add(item.id); return n; });
      }
    });
  }, [pieceSearchLower]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadItemDetail = useCallback(async (item) => {
    setSelectedItem(item);
    if (!item.modele_id) { setItemPieces([]); return; }
    const { data } = await supabase
      .from('modeles_pieces')
      .select('*, piece:pieces_sous_ensembles(id, nom, reference, description_aide)')
      .eq('modele_id', item.modele_id);
    setItemPieces(data || []);
  }, []);

  const loadPieceHelp = useCallback(async (piece, preselectedPanneId = null, filterDescription = null) => {
    setSelectedPieceHelp(piece);
    setWizardStep(0);
    setWizardPanne(null);
    setWizardCheckedIds(new Set());
    setWizardFilter(filterDescription || null);
    setWizardFromSEHelp(!!filterDescription);
    setHelpTab('guide');
    const [pnRes, prRes] = await Promise.all([
      supabase.from('pieces_pannes').select('*').eq('piece_id', piece.id).order('created_at'),
      supabase.from('pieces_procedures').select('*').eq('piece_id', piece.id).order('ordre'),
    ]);
    if (!pnRes.error) {
      const fetchedPannes = pnRes.data || [];
      setPannes(fetchedPannes);
      const panneIds = fetchedPannes.map(p => p.id);
      if (panneIds.length > 0) {
        const { data: checks } = await supabase
          .from('pieces_pannes_checks')
          .select('*, piece:pieces_sous_ensembles(id, nom)')
          .in('panne_id', panneIds)
          .order('ordre');
        const map = {};
        for (const c of (checks || [])) {
          if (!map[c.panne_id]) map[c.panne_id] = [];
          map[c.panne_id].push(c);
        }
        setPanneChecksMap(map);
        if (preselectedPanneId) {
          const found = fetchedPannes.find(p => p.id === preselectedPanneId);
          if (found && (map[found.id] || []).length > 0) {
            setWizardPanne(found);
            setWizardStep(1);
          }
        }
      } else {
        setPanneChecksMap({});
      }
    }
    if (!prRes.error) setProcedures(prRes.data || []);
    setIsHelpOpen(true);
  }, []);

  const showOk = (msg) => toast({ title: msg, className: 'bg-success text-success-foreground' });
  const showErr = (msg) => toast({ title: 'Erreur', description: msg, variant: 'destructive' });
  const formatDate = (d) => d ? new Date(d).toLocaleDateString(appLocale()) : '—';

  const openSousEnsembleHelp = async (item, e) => {
    e?.stopPropagation();
    setSelectedItem(item);
    loadItemDetail(item);
    setSeHelpItem(item);
    setSeHelpPannes([]);
    setSeHelpChecksMap({});
    setSeDiagnosticPanne(null);
    setSeDiagnosticCheckedIds(new Set());
    setSeDiagnosticView('guide');
    setSeDiagnosticProcedures([]);
    setIsDiagnosticDocsLoading(false);
    setIsDiagnosticLoading(true);
    setIsSEHelpOpen(true);
    if (!item.modele_id) { setIsDiagnosticLoading(false); return; }
    const { data: modelePieces } = await supabase
      .from('modeles_pieces')
      .select('piece_id, piece:pieces_sous_ensembles(id, nom, reference, sous_ensemble, description_aide, photo_url, commentaire)')
      .eq('modele_id', item.modele_id);
    const pieceIds = (modelePieces || []).map(mp => mp.piece_id).filter(Boolean);
    if (!pieceIds.length) { setIsDiagnosticLoading(false); return; }
    const pieceMap = {};
    for (const mp of (modelePieces || [])) {
      if (mp.piece?.id) pieceMap[mp.piece.id] = mp.piece;
    }
    const { data: allPannes } = await supabase
      .from('pieces_pannes')
      .select('*')
      .in('piece_id', pieceIds)
      .order('poids', { ascending: false });
    const enrichedPannes = (allPannes || []).map(p => ({ ...p, piece: pieceMap[p.piece_id] || null }));
    setSeHelpPannes(enrichedPannes);

    const panneIds = enrichedPannes.map(p => p.id).filter(Boolean);
    if (panneIds.length > 0) {
      const { data: checks } = await supabase
        .from('pieces_pannes_checks')
        .select('*, piece:pieces_sous_ensembles(id, nom, reference)')
        .in('panne_id', panneIds)
        .order('ordre');
      const checksMap = {};
      for (const check of (checks || [])) {
        if (!checksMap[check.panne_id]) checksMap[check.panne_id] = [];
        checksMap[check.panne_id].push(check);
      }
      setSeHelpChecksMap(checksMap);
    }
    setIsDiagnosticLoading(false);
  };

  const selectDiagnosticPanne = async (panne) => {
    setSeDiagnosticPanne(panne);
    setSeDiagnosticCheckedIds(new Set());
    setSeDiagnosticView('guide');
    setSeDiagnosticProcedures([]);
    setIsDiagnosticDocsLoading(false);
    if (!panne?.piece?.id) return;
    setIsDiagnosticDocsLoading(true);
    const { data } = await supabase
      .from('pieces_procedures')
      .select('*')
      .eq('piece_id', panne.piece.id)
      .order('ordre');
    setSeDiagnosticProcedures(data || []);
    setIsDiagnosticDocsLoading(false);
  };

  const completeDiagnostic = () => {
    if (!seHelpItem || !seDiagnosticPanne || seDiagnosticCheckedIds.size === 0) return;
    setDiagnosticSessions(prev => ({
      ...prev,
      [seHelpItem.id]: {
        panne: seDiagnosticPanne.description,
        piece: seDiagnosticPanne.piece?.nom || null,
        checkedCount: seDiagnosticCheckedIds.size,
        totalChecks: seDiagnosticChecks.length,
        completedAt: new Date().toISOString(),
      },
    }));
    setIsSEHelpOpen(false);
    showOk('Diagnostic validé. Vous pouvez maintenant traiter la pièce concernée.');
  };

  const markATester = async (item) => {
    const itemIds = getStockDefectueuxRecordIds(item);
    const { error } = await supabase.from('stock_defectueux').update({ statut: 'a_tester' }).in('id', itemIds);
    if (error) { showErr(describeError(error, 'ReparationTerminauxTab')); return; }
    showOk('Sous-ensemble passé à "À tester".');
    setSelectedItem(prev => prev && itemIds.includes(prev.id) ? { ...prev, statut: 'a_tester' } : prev);
    setStock(prev => prev.map(s => itemIds.includes(s.id) ? { ...s, statut: 'a_tester' } : s));
    setTreatedPieces(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  };

  const markRepare = async (item) => {
    const itemIds = getStockDefectueuxRecordIds(item);
    const { error } = await supabase.from('stock_defectueux').update({ statut: 'repare', date_sortie: new Date().toISOString() }).in('id', itemIds);
    if (error) { showErr(describeError(error, 'ReparationTerminauxTab')); return; }
    const table = item?.type_sous_ensemble ? EQUIP_TABLE_MAP[item.type_sous_ensemble] : null;
    if (table && item?.reference_sous_ensemble) {
      await supabase.from(table).update({ statut: 'Disponible' }).eq('reference', item.reference_sous_ensemble);
    }
    showOk('Sous-ensemble marqué Réparé — statut remis à Disponible.');
    setSelectedItem(null);
    load();
  };

  const toggleExpand = useCallback(async (item) => {
    const id = item.id;
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      return next;
    });
    if (itemPiecesCache[id] !== undefined) return;
    if (!item.modele_id) {
      setItemPiecesCache(prev => ({ ...prev, [id]: [] }));
      return;
    }
    setLoadingExpandIds(prev => new Set(prev).add(id));
    const { data } = await supabase
      .from('modeles_pieces')
      .select('*, piece:pieces_sous_ensembles(id, nom, reference, description_aide)')
      .eq('modele_id', item.modele_id);
    setItemPiecesCache(prev => ({ ...prev, [id]: data || [] }));
    setLoadingExpandIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, [itemPiecesCache]);

  const markNettoye = async (piece, item) => {
    const { error } = await supabase.from('stock_pieces_mouvements').insert({
      piece_id: piece.id,
      type: 'nettoyage',
      quantite: 0,
      motif: `Nettoyage sur ${item.reference_sous_ensemble}`,
      stock_defectueux_id: item.id,
    });
    if (error) { showErr(describeError(error, 'ReparationTerminauxTab')); return; }
    setTreatedPieces(prev => ({
      ...prev,
      [item.id]: { ...(prev[item.id] || {}), [piece.id]: 'nettoyage' },
    }));
    showOk(`Pièce "${piece.nom}" marquée comme Nettoyée.`);
  };

  const openReplace = (piece, item = null) => {
    if (item) setSelectedItem(item);
    setReplacingPiece(piece);
    setReplacePieceId('');
    setIsReplaceOpen(true);
  };

  const confirmReplace = async () => {
    if (!replacePieceId || !replacingPiece || !selectedItem) return;
    const existing = stockPiecesById[replacePieceId];
    if (!existing || existing.quantite < 1) { showErr('Stock insuffisant pour cette pièce.'); return; }
    setIsLoading(true);
    const newQty = existing.quantite - 1;
    const { error: stockError } = await supabase.from('stock_pieces').update({ quantite: newQty, updated_at: new Date().toISOString() }).eq('piece_id', replacePieceId);
    if (stockError) { showErr(describeError(stockError, 'ReparationTerminauxTab')); setIsLoading(false); return; }
    await supabase.from('stock_pieces_mouvements').insert({
      piece_id: replacePieceId, type: 'sortie', quantite: 1,
      motif: `Remplacement sur ${selectedItem.reference_sous_ensemble}`,
      stock_defectueux_id: selectedItem.id,
    });
    setTreatedPieces(prev => ({
      ...prev,
      [selectedItem.id]: { ...(prev[selectedItem.id] || {}), [replacingPiece.id]: 'remplacement' },
    }));
    showOk('Pièce remplacée — stock mis à jour.');
    setIsReplaceOpen(false);
    load();
    setIsLoading(false);
  };

  // Pièces de remplacement : UNIQUEMENT la même pièce (même référence ou même nom —
  // une même pièce peut exister sous plusieurs références fournisseur), du même
  // sous-ensemble, compatible avec le type de terminal, et en stock.
  // (Avant : toute pièce du sous-ensemble, et toute pièce « tous terminaux » quel
  // que soit le sous-ensemble.)
  const compatiblePieces = useMemo(() => {
    if (!replacingPiece || !selectedItem) return [];
    const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const refKey = norm(replacingPiece.reference);
    const nameKey = norm(replacingPiece.nom);
    const terminal = selectedItem.type_terminal;
    return pieces.filter((p) => {
      const samePiece = p.id === replacingPiece.id
        || (refKey && norm(p.reference) === refKey)
        || (nameKey && norm(p.nom) === nameKey);
      const sameSousEnsemble = !p.sous_ensemble || p.sous_ensemble === selectedItem.type_sous_ensemble;
      const terminalOk = !terminal || !p.type_terminal || p.type_terminal === 'tous' || p.type_terminal === terminal;
      return samePiece && sameSousEnsemble && terminalOk && (stockPiecesById[p.id]?.quantite || 0) > 0;
    });
  }, [pieces, replacingPiece, selectedItem, stockPiecesById]);

  return (
    <div className="space-y-6">
      <Card variant="accent">
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2 text-2xl font-bold text-primary">
            <Wrench className="h-6 w-6" /> Réparation des Sous-ensembles
          </CardTitle>
          <CardDescription>
            Sélectionnez un sous-ensemble défectueux pour voir ses pièces et lancer la procédure de réparation.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Liste gauche */}
        <div className="lg:col-span-2">
          <Card variant="accent">
            <CardHeader className="relative pb-3">
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Package2 className="h-5 w-5" /> Sous-ensembles à traiter
              </CardTitle>
              <CardDescription>Filtre par type, terminal ou pièce détachée</CardDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Tous les types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous les types</SelectItem>
                    {Object.entries(SOUS_ENSEMBLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterTerminal} onValueChange={setFilterTerminal}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="Terminal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tous</SelectItem>
                    <SelectItem value="2020">2020</SelectItem>
                    <SelectItem value="2031">2031</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative pt-1">
                <Search className="absolute left-2.5 top-[calc(0.25rem+0.5rem)] h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Rechercher une pièce détachée..."
                  value={pieceSearch}
                  onChange={e => setPieceSearch(e.target.value)}
                  className="pl-8 pr-7 h-8 text-xs"
                />
                {pieceSearch && (
                  <button aria-label="Effacer la recherche"
                    className="absolute right-2 top-[calc(0.25rem+0.5rem)] text-muted-foreground hover:text-foreground"
                    onClick={() => setPieceSearch('')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredStock.length === 0 ? (
                isLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Chargement...</p>
                ) : (
                  <EmptyState
                    compact
                    plain
                    title={assignedOnly ? 'Aucun sous-ensemble défectueux ne vous est assigné' : 'Aucun sous-ensemble à traiter'}
                  />
                )
              ) : (
                <div className="divide-y max-h-[32rem] overflow-y-auto">
                  {filteredStock.map(item => {
                    const isExpanded = expandedItems.has(item.id);
                    const cachedPieces = itemPiecesCache[item.id];
                    const isLoadingExpand = loadingExpandIds.has(item.id);
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <div key={item.id} className={isSelected ? 'bg-primary/5' : ''}>
                        <div className="flex min-w-0 items-center gap-1 pr-2">
                          <button
                            className="min-w-0 flex-1 px-3 py-3 text-left transition-colors hover:bg-muted/40"
                            onClick={() => loadItemDetail(item)}
                            aria-current={isSelected ? 'true' : undefined}
                          >
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className={`shrink-0 font-mono text-sm font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>{item.reference_sous_ensemble}</span>
                              <span className="shrink-0 rounded-pill border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">
                                {SOUS_ENSEMBLE_LABELS[item.type_sous_ensemble] || item.type_sous_ensemble}
                              </span>
                              {item.type_terminal && (
                                <span className="shrink-0 rounded-pill border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80">{item.type_terminal}</span>
                              )}
                            </div>
                          </button>
                          <button
                            className="flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                            onClick={(e) => openSousEnsembleHelp(item, e)}
                            title="Lancer le diagnostic guidé"
                          >
                            <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                            <span className="sr-only xs:not-sr-only">Diagnostiquer</span>
                          </button>
                          <button
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors hover:bg-muted"
                            title={isExpanded ? 'Réduire' : 'Voir les pièces'}
                            aria-label={isExpanded ? `Réduire les pièces de ${item.reference_sous_ensemble}` : `Voir les pièces de ${item.reference_sous_ensemble}`}
                            aria-expanded={isExpanded}
                            onClick={() => toggleExpand(item)}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="space-y-1.5 px-3 pb-3">
                            {isLoadingExpand ? (
                              <p className="text-xs text-muted-foreground py-2 text-center">Chargement des pièces...</p>
                            ) : !cachedPieces || cachedPieces.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2 text-center">
                                {!item.modele_id ? 'Aucun modèle associé.' : 'Aucune pièce référencée.'}
                              </p>
                            ) : (
                              <>
                                {pieceSearchLower && !cachedPieces.some(mp =>
                                  mp.piece?.nom?.toLowerCase().includes(pieceSearchLower) ||
                                  mp.piece?.reference?.toLowerCase().includes(pieceSearchLower)
                                ) ? (
                                  <p className="text-xs text-muted-foreground py-1 text-center italic">Aucune pièce ne correspond à la recherche.</p>
                                ) : null}
                                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                                {cachedPieces
                                  .filter(mp => !pieceSearchLower ||
                                    mp.piece?.nom?.toLowerCase().includes(pieceSearchLower) ||
                                    mp.piece?.reference?.toLowerCase().includes(pieceSearchLower)
                                  )
                                  .map(mp => {
                                  const stock = getStockState(stockPiecesById[mp.piece?.id]);
                                  const pieceAction = treatedPieces[item.id]?.[mp.piece?.id];
                                  return (
                                    <li key={mp.id} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${pieceAction ? 'bg-success-muted/40' : ''}`}>
                                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{mp.piece?.nom}</span>
                                      {pieceAction ? (
                                        <span className={`shrink-0 rounded-pill px-2 py-px text-xs font-semibold ${pieceAction === 'nettoyage' ? 'bg-success-muted text-success-muted-foreground' : 'bg-info-muted text-info-muted-foreground'}`}>
                                          {pieceAction === 'nettoyage' ? '✓ Nettoyée' : '✓ Remplacée'}
                                        </span>
                                      ) : (
                                        <span className={`shrink-0 rounded-pill px-2 py-px text-xs font-semibold ${stock.tone}`}>{stock.label}</span>
                                      )}
                                    </li>
                                  );
                                })}
                                </ul>
                                {item.statut === 'a_tester' && (
                                  <div className="pt-1.5 border-t border-dashed border-muted-foreground/20">
                                    <p className="text-xs text-center text-warning-muted-foreground font-medium">En attente de validation du test</p>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Détail droite */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedItem ? (
            <Card variant="accent" className="flex items-center justify-center py-20">
              <EmptyState plain icon={Package2} title="Sélectionnez un sous-ensemble pour commencer" />
            </Card>
          ) : (
            <>
              <Card variant="accent">
                <CardHeader className="relative space-y-3 pb-3">
                  {/* Identité du sous-ensemble : référence, contexte en pastilles, date, statut */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <CardTitle className="font-mono">{selectedItem.reference_sous_ensemble}</CardTitle>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {[SOUS_ENSEMBLE_LABELS[selectedItem.type_sous_ensemble], selectedItem.type_terminal, selectedItem.agence?.nom]
                          .filter(Boolean)
                          .map((info) => (
                            <span key={info} className="rounded-pill border border-border bg-muted/50 px-2 py-0.5 font-medium text-foreground/80">{info}</span>
                          ))}
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" /> Entré le {formatDate(selectedItem.date_entree)}
                        </span>
                      </div>
                    </div>
                    <StatutBadge statut={selectedItem.statut} />
                  </div>

                  {/* Fiche panne : un seul encart neutre, liseré rouge = panne signalée */}
                  {(() => {
                    const inv = selectedItem.intervention;
                    const cp = inv?.code_panne || inv?.code_intervention;
                    const commentaire = inv?.commentaire || selectedItem.commentaire;
                    if (!cp && !commentaire) return null;
                    return (
                      <div className="space-y-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                        {cp && (
                          <div className="flex flex-wrap items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                            <span className="sr-only">Code panne :</span>
                            <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-bold text-destructive">{cp.code}</span>
                            <span className="text-sm font-semibold text-foreground">{cp.libelle}</span>
                          </div>
                        )}
                        {inv?.description_panne && (
                          <p className="pl-6 text-sm text-foreground/80">
                            <span className="font-medium text-muted-foreground">Descriptif : </span>{inv.description_panne}
                          </p>
                        )}
                        {commentaire && (
                          <p className="flex items-start gap-2 border-t border-border/70 pt-2 text-xs text-muted-foreground" title={commentaire}>
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="line-clamp-2"><span className="font-medium">Commentaire : </span>{commentaire}</span>
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const session = diagnosticSessions[selectedItem.id];
                    const treatedCount = Object.keys(treatedPieces[selectedItem.id] || {}).length;
                    const diagnosticIsOpen = isSEHelpOpen && seHelpItem?.id === selectedItem.id;
                    const steps = [
                      { label: 'Signalement', detail: 'Panne reçue', done: true, active: false },
                      {
                        label: 'Diagnostic',
                        detail: session ? `${session.checkedCount} contrôle(s)` : diagnosticIsOpen ? 'En cours' : 'À réaliser',
                        done: Boolean(session),
                        active: diagnosticIsOpen,
                      },
                      {
                        label: 'Intervention',
                        detail: treatedCount > 0 ? `${treatedCount} pièce(s) traitée(s)` : 'À réaliser',
                        done: treatedCount > 0,
                        active: Boolean(session) && treatedCount === 0,
                      },
                      {
                        label: 'Test',
                        detail: selectedItem.statut === 'a_tester' ? 'À valider' : 'En attente',
                        done: selectedItem.statut === 'repare',
                        active: selectedItem.statut === 'a_tester',
                      },
                    ];
                    // Frise de progression : pastilles reliées par un trait (vert jusqu'à
                    // la dernière étape terminée), libellé + détail centrés dessous.
                    return (
                      <ol className="grid grid-cols-4" aria-label="Avancement de la réparation">
                        {steps.map((step, index) => {
                          const next = steps[index + 1];
                          return (
                            <li key={step.label} className="relative flex min-w-0 flex-col items-center px-1 text-center" aria-current={step.active ? 'step' : undefined}>
                              {next && (
                                <span
                                  aria-hidden="true"
                                  className={`absolute left-[calc(50%+0.875rem)] right-[calc(-50%+0.875rem)] top-3 h-0.5 rounded-full ${step.done && (next.done || next.active) ? 'bg-success' : 'bg-border'}`}
                                />
                              )}
                              <span className={`relative z-[1] flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-4 ring-card ${
                                step.done
                                  ? 'bg-success text-success-foreground'
                                  : step.active
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                              }`}>
                                {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                              </span>
                              <span className={`mt-1.5 max-w-full truncate text-xs font-semibold ${step.active ? 'text-primary' : step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
                              <span className="max-w-full truncate text-xs text-muted-foreground">{step.detail}</span>
                            </li>
                          );
                        })}
                      </ol>
                    );
                  })()}
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.statut !== 'a_tester' && selectedItem.statut !== 'repare' && (
                      <Button
                        size="sm"
                        onClick={() => openSousEnsembleHelp(selectedItem)}
                      >
                        <Stethoscope className="mr-2 h-4 w-4" />
                        {diagnosticSessions[selectedItem.id] ? 'Reprendre le diagnostic' : 'Lancer le diagnostic'}
                      </Button>
                    )}
                    {canManage && selectedItem.statut !== 'repare' && selectedItem.statut !== 'a_tester' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={Object.keys(treatedPieces[selectedItem.id] || {}).length > 0 ? 'bg-warning text-warning-foreground border-warning hover:bg-warning/90' : 'text-warning-muted-foreground border-warning/30'}
                        onClick={() => markATester(selectedItem)}
                      >
                        <FlaskConical className="mr-2 h-4 w-4" />
                        Passer en test
                        {Object.keys(treatedPieces[selectedItem.id] || {}).length > 0 && (
                          <span className="ml-1.5 rounded-pill bg-card/30 px-1.5 text-xs font-bold">
                            {Object.keys(treatedPieces[selectedItem.id]).length}
                          </span>
                        )}
                      </Button>
                    )}
                    {canManage && selectedItem.statut === 'a_tester' && (
                      <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => markRepare(selectedItem)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Marquer Réparé
                      </Button>
                    )}
                  </div>

                  {/* Pièces traitées dans la session */}
                  {Object.keys(treatedPieces[selectedItem.id] || {}).length > 0 && (
                    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary/80 flex items-center gap-1.5">
                        <CheckCheck className="h-3.5 w-3.5" /> Pièces traitées cette session
                      </p>
                      <div className="space-y-1.5">
                        {Object.entries(treatedPieces[selectedItem.id]).map(([pieceId, action]) => {
                          const piece = itemPieces.find(mp => String(mp.piece?.id) === String(pieceId))?.piece
                            || (itemPiecesCache[selectedItem.id] || []).find(mp => String(mp.piece?.id) === String(pieceId))?.piece;
                          return (
                            <div key={pieceId} className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs shadow-sm border border-white">
                              <span className="font-medium truncate">{piece?.nom || `Pièce #${pieceId}`}</span>
                              <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-bold ${action === 'nettoyage' ? 'bg-success-muted text-success-muted-foreground' : 'bg-info-muted text-info-muted-foreground'}`}>
                                {action === 'nettoyage' ? '✓ Nettoyée' : '✓ Remplacée'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {isSEHelpOpen && seHelpItem?.id === selectedItem.id && (
                <Dialog open={isSEHelpOpen} onOpenChange={setIsSEHelpOpen}>
                <DialogContent className="diagnostic-guided-dialog sm:max-w-3xl w-[min(94vw,52rem)] max-h-[84vh] flex flex-col gap-0 overflow-hidden border-primary/25 p-0">
                  <div className="relative shrink-0 border-b bg-transparent px-4 pb-3 pt-5 pr-14 sm:px-6 sm:pr-14">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-lg text-primary">
                          <Stethoscope className="h-5 w-5" /> Diagnostic guidé
                          <span className="font-mono text-foreground">{seHelpItem?.reference_sous_ensemble}</span>
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {seDiagnosticPanne
                            ? `${seDiagnosticPanne.piece?.nom || 'Pièce'} · ${seDiagnosticPanne.description}`
                            : 'Sélectionnez le symptôme ou la pièce à contrôler.'}
                        </CardDescription>
                      </div>
                      {seDiagnosticPanne?.piece && <Badge variant="outline" className="shrink-0 bg-background">{seDiagnosticPanne.piece.reference || seDiagnosticPanne.piece.nom}</Badge>}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border bg-background p-1">
                      {['Symptôme', 'Contrôles', 'Action'].map((label, index) => {
                        const activeIndex = seDiagnosticPanne ? (seDiagnosticCheckedIds.size > 0 ? 2 : 1) : 0;
                        const done = index < activeIndex;
                        const active = index === activeIndex;
                        return (
                          <div key={label} className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-success-muted text-success-muted-foreground' : 'text-muted-foreground'}`}>
                            {done ? <Check className="h-3 w-3 shrink-0" /> : <span className="shrink-0">{index + 1}</span>}
                            <span className="whitespace-nowrap">{label}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border bg-background p-1">
                      <button
                        type="button"
                        onClick={() => setSeDiagnosticView('guide')}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${seDiagnosticView === 'guide' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                      >
                        <Stethoscope className="h-4 w-4" /> Guide diagnostic
                      </button>
                      <button
                        type="button"
                        disabled={!seDiagnosticPanne?.piece}
                        onClick={() => setSeDiagnosticView('documentation')}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                          seDiagnosticView === 'documentation'
                            ? 'bg-primary text-primary-foreground'
                            : seDiagnosticPanne?.piece
                              ? 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                              : 'cursor-not-allowed text-muted-foreground/40'
                        }`}
                        title={seDiagnosticPanne?.piece ? 'Consulter la documentation de la pièce' : 'Sélectionnez d’abord une pièce'}
                      >
                        <HelpCircle className="h-4 w-4" /> Documentation
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                    {seDiagnosticView === 'documentation' ? (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Aide à la réparation</p>
                            <h3 className="mt-1 text-lg font-bold text-foreground">{seDiagnosticPanne?.piece?.nom}</h3>
                            {seDiagnosticPanne?.piece?.reference && (
                              <p className="font-mono text-xs text-muted-foreground">{seDiagnosticPanne.piece.reference}</p>
                            )}
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSeDiagnosticView('guide')}>
                            <ChevronLeft className="mr-1 h-4 w-4" /> Revenir aux contrôles
                          </Button>
                        </div>

                        {seDiagnosticPanne?.piece?.description_aide ? (
                          <section className="border-b pb-4">
                            <h4 className="flex items-center gap-2 text-sm font-semibold">
                              <HelpCircle className="h-4 w-4 text-primary" /> Description
                            </h4>
                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{seDiagnosticPanne.piece.description_aide}</p>
                          </section>
                        ) : (
                          <p className="border-b pb-4 text-sm text-muted-foreground">Aucune description d'aide n'est renseignée pour cette pièce.</p>
                        )}

                        {seDiagnosticPanne?.piece?.photo_url && (
                          <section className="border-b pb-4">
                            <h4 className="mb-2 text-sm font-semibold">Repère visuel</h4>
                            <img
                              src={seDiagnosticPanne.piece.photo_url}
                              alt={seDiagnosticPanne.piece.nom}
                              className="max-h-64 w-full rounded-md border bg-card object-contain"
                            />
                          </section>
                        )}

                        <section className="border-b pb-4">
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <AlertTriangle className="h-4 w-4 text-warning-muted-foreground" /> Pannes connues
                          </h4>
                          <div className="mt-2 divide-y rounded-md border bg-background">
                            {seHelpPannes
                              .filter(panne => String(panne.piece_id) === String(seDiagnosticPanne?.piece?.id))
                              .map(panne => (
                                <button
                                  key={panne.id}
                                  type="button"
                                  onClick={() => { selectDiagnosticPanne(panne); setSeDiagnosticView('guide'); }}
                                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40 ${panne.id === seDiagnosticPanne?.id ? 'bg-warning-muted text-warning-muted-foreground' : ''}`}
                                >
                                  <span className="min-w-0 flex-1">{panne.description}</span>
                                  {panne.id === seDiagnosticPanne?.id && <StatusBadge tone="warning">En cours</StatusBadge>}
                                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </button>
                              ))}
                          </div>
                        </section>

                        <section>
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <ListChecks className="h-4 w-4 text-primary" /> Procédure de réparation
                          </h4>
                          {isDiagnosticDocsLoading ? (
                            <p className="mt-3 text-sm text-muted-foreground">Chargement de la procédure...</p>
                          ) : seDiagnosticProcedures.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">Aucune procédure n'est encore renseignée pour cette pièce.</p>
                          ) : (
                            <ol className="mt-3 space-y-3">
                              {seDiagnosticProcedures.map((procedure, index) => (
                                <li key={procedure.id} className="flex gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="whitespace-pre-line text-sm leading-6">{procedure.description}</p>
                                    {procedure.image_url && (
                                      <img src={procedure.image_url} alt={`Étape ${index + 1}`} className="mt-2 max-h-56 w-full rounded-md border bg-card object-contain" />
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}
                        </section>
                      </div>
                    ) : isDiagnosticLoading ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Chargement du référentiel de diagnostic...</div>
                    ) : !seHelpItem?.modele_id ? (
                      <div className="rounded-md border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning-muted-foreground">
                        Aucun modèle n'est associé à ce sous-ensemble.
                      </div>
                    ) : seHelpPannes.length === 0 ? (
                      <EmptyState compact title="Aucun diagnostic n'est configuré pour ce modèle" />
                    ) : !seDiagnosticPanne ? (
                      <>
                        {(() => {
                          const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                          const declaredFault = seHelpItem?.intervention?.code_panne?.libelle || '';
                          const sortedPannes = [...seHelpPannes].sort((a, b) => {
                            const aMatch = declaredFault && normalize(a.description) === normalize(declaredFault) ? 1 : 0;
                            const bMatch = declaredFault && normalize(b.description) === normalize(declaredFault) ? 1 : 0;
                            return bMatch - aMatch || (b.poids || 3) - (a.poids || 3);
                          });
                          return (
                            // Liste unique à séparateurs : le SYMPTÔME d'abord (la question posée),
                            // la pièce concernée en second ; poids en pastille discrète.
                            <ul className="max-h-[24rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
                              {sortedPannes.map(panne => {
                                const checks = seHelpChecksMap[panne.id] || [];
                                const hasChecks = checks.length > 0;
                                const recommended = declaredFault && normalize(panne.description) === normalize(declaredFault);
                                return (
                                  <li key={panne.id}>
                                    <button
                                      type="button"
                                      disabled={!hasChecks}
                                      onClick={() => selectDiagnosticPanne(panne)}
                                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                        recommended ? 'bg-warning-muted/50' : ''
                                      } ${hasChecks ? (recommended ? 'hover:bg-warning-muted' : 'hover:bg-muted/40') : 'cursor-not-allowed'}`}
                                    >
                                      <span
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                          recommended ? 'bg-warning text-warning-foreground' : hasChecks ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                                        }`}
                                        title="Poids du symptôme (fréquence / probabilité)"
                                      >
                                        {panne.poids || 3}
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="flex flex-wrap items-center gap-1.5">
                                          <span className={`truncate text-sm font-semibold ${hasChecks || recommended ? 'text-foreground' : 'text-muted-foreground'}`}>{panne.description}</span>
                                          {recommended && <span className="rounded-pill bg-warning-muted px-2 py-px text-xs font-semibold text-warning-muted-foreground">Panne déclarée</span>}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs uppercase tracking-wide text-muted-foreground">{panne.piece?.nom || 'Pièce non renseignée'}</span>
                                      </span>
                                      <span className={`shrink-0 rounded-pill px-2 py-px text-xs font-semibold ${hasChecks ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {hasChecks ? `${checks.length} contrôle${checks.length > 1 ? 's' : ''}` : 'Aucun contrôle'}
                                      </span>
                                      {hasChecks && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{seDiagnosticPanne.piece?.nom || 'Pièce'}</p>
                            <p className="truncate text-xs text-muted-foreground">{seDiagnosticPanne.description}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSeDiagnosticPanne(null); setSeDiagnosticCheckedIds(new Set()); }}
                          >
                            <ChevronLeft className="mr-1 h-4 w-4" /> Changer
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {seDiagnosticChecks.map((check, index) => {
                            const checked = seDiagnosticCheckedIds.has(check.id);
                            return (
                              <button
                                key={check.id}
                                type="button"
                                onClick={() => setSeDiagnosticCheckedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(check.id)) next.delete(check.id); else next.add(check.id);
                                  return next;
                                })}
                                className={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${checked ? 'border-success/30 bg-success-muted' : 'bg-background hover:bg-muted/30'}`}
                              >
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-success bg-success text-success-foreground' : 'border-muted-foreground/30'}`}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm">{check.description_verification}</span>
                                  {check.piece && <span className="mt-0.5 block text-xs text-muted-foreground">Pièce concernée : {check.piece.nom}</span>}
                                </span>
                                <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
                              </button>
                            );
                          })}
                        </div>

                        {seDiagnosticCheckedIds.size > 0 && (
                          <div className="space-y-2 rounded-md border border-success/30 bg-success-muted/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-success-muted-foreground">Résultat du diagnostic</p>
                              <span className="text-xs text-success-muted-foreground">{seDiagnosticCheckedIds.size}/{seDiagnosticChecks.length} contrôles</span>
                            </div>
                            {seDiagnosticPieces.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Aucune pièce spécifique n'est liée aux contrôles sélectionnés.</p>
                            ) : seDiagnosticPieces.map(piece => {
                              const action = treatedPieces[selectedItem.id]?.[piece.id];
                              return (
                                <div key={piece.id} className="flex flex-wrap items-center gap-2 border-t border-success/30 pt-2 first:border-t-0 first:pt-0">
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{piece.nom}</span>
                                  {action ? (
                                    <Badge variant="success">{action === 'nettoyage' ? 'Nettoyée' : 'Remplacée'}</Badge>
                                  ) : canManage ? (
                                    <>
                                      <Button size="sm" variant="outline" className="h-7 text-xs text-success-muted-foreground" onClick={() => markNettoye(piece, selectedItem)}>
                                        <Sparkles className="mr-1 h-3 w-3" /> Nettoyer
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openReplace(piece, selectedItem)}>
                                        <ArrowRight className="mr-1 h-3 w-3" /> Remplacer
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                          <div className="min-w-[12rem] flex-1">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((seDiagnosticCheckedIds.size / Math.max(seDiagnosticChecks.length, 1)) * 100)}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Cochez les contrôles réellement effectués.</p>
                          </div>
                          <Button type="button" size="sm" disabled={seDiagnosticCheckedIds.size === 0} onClick={completeDiagnostic}>
                            <CheckCheck className="mr-2 h-4 w-4" /> Valider le diagnostic
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
                </Dialog>
              )}

              {/* Pièces du modèle */}
              {(itemPieces.length > 0 || selectedItem.modele_id) && (() => {
                const levels = itemPieces.map((mp) => getStockState(stockPiecesById[mp.piece?.id]).level);
                const outOfStock = levels.filter((l) => l === 'out').length;
                const lowStock = levels.filter((l) => l === 'low').length;
                return (
                <Card>
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-primary">
                      <Wrench className="h-4 w-4" /> Pièces du modèle
                    </CardTitle>
                    {itemPieces.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">{itemPieces.length} pièce(s)</span>
                        {outOfStock > 0 && <span className="rounded-pill bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">{outOfStock} en rupture</span>}
                        {lowStock > 0 && <span className="rounded-pill bg-warning-muted px-2 py-0.5 font-semibold text-warning-muted-foreground">{lowStock} stock bas</span>}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {itemPieces.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Aucune pièce référencée pour ce modèle.</p>
                    ) : (
                      <ul className="max-h-[22rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
                        {itemPieces.map((mp) => {
                          const stock = getStockState(stockPiecesById[mp.piece?.id]);
                          return (
                            <li key={mp.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 transition-colors hover:bg-muted/40">
                              <div className="min-w-0 flex-1 basis-[12rem]">
                                <p className="truncate text-xs font-semibold text-foreground">{mp.piece?.nom}</p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="truncate font-mono text-xs text-muted-foreground">{mp.piece?.reference}</span>
                                  <span className="text-xs tabular-nums text-muted-foreground" title="Quantité dans le modèle">×{mp.quantite}</span>
                                  <span className={`rounded-pill px-2 py-px text-xs font-semibold ${stock.tone}`}>{stock.label}</span>
                                </div>
                              </div>
                              <div className="ml-auto flex shrink-0 items-center gap-1">
                                {mp.piece && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="Aide à la réparation" aria-label={`Aide à la réparation — ${mp.piece.nom}`} onClick={() => loadPieceHelp(mp.piece)}>
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {canManage && mp.piece && (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-success-muted-foreground hover:bg-success-muted" onClick={() => markNettoye(mp.piece, selectedItem)}>
                                      <Sparkles className="mr-1 h-3 w-3" />Nettoyée
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openReplace(mp.piece)}>
                                      <ArrowRight className="mr-1 h-3 w-3" />Remplacer
                                    </Button>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Dialog aide réparation */}
      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent className="sm:max-w-lg w-full flex flex-col h-[62vh] p-0 gap-0 overflow-hidden !rounded-2xl">


          {/* Header */}
          <div className="shrink-0 px-6 pt-5 pb-0 border-b bg-surface-subtle">
            <div className="flex items-start justify-between gap-2 pb-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-primary leading-tight truncate">
                  {selectedPieceHelp?.nom}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Guide de diagnostic par symptôme</p>
              </div>
              {wizardFromSEHelp && (
                <button
                  onClick={() => { setIsHelpOpen(false); setIsSEHelpOpen(true); }}
                  className="shrink-0 flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" /> Formulaire Diagnostique
                </button>
              )}
            </div>

            {/* Filtre actif */}
            {wizardFilter && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-warning-muted border border-warning/30 px-2.5 py-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning-muted-foreground" />
                <span className="text-xs text-warning-muted-foreground">Filtré sur&nbsp;: <span className="font-semibold">{wizardFilter}</span></span>
                <button aria-label="Retirer le filtre de diagnostic" onClick={() => setWizardFilter(null)} className="ml-auto text-warning-muted-foreground hover:text-warning-muted-foreground transition-colors"><X className="h-3 w-3" /></button>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0">
              {[
                { id: 'guide', icon: Stethoscope, label: 'Guide Diagnostic' },
                { id: 'docs',  icon: HelpCircle,  label: 'Documentation' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setHelpTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    helpTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" /> {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {selectedPieceHelp && helpTab === 'guide' && (
              <div className="space-y-4">
                {pannes.length === 0 ? (
                  <EmptyState
                    icon={ListChecks}
                    title="Aucun guide de diagnostic configuré"
                    description="Ajoutez des types de pannes avec leurs vérifications dans Exploitation → Aide à la Réparation."
                    action={<Button type="button" variant="outline" size="sm" onClick={() => setHelpTab('docs')}>Voir la documentation</Button>}
                  />
                ) : wizardStep === 0 ? (
                  <>
                    {(() => {
                      const normStr = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                      const displayedPannes = wizardFilter
                        ? [...pannes].filter(p => normStr(p.description) === normStr(wizardFilter)).sort((a, b) => (b.poids || 3) - (a.poids || 3))
                        : [...pannes].sort((a, b) => (b.poids || 3) - (a.poids || 3));
                      const displayedWithChecks = displayedPannes.filter(p => (panneChecksMap[p.id] || []).length > 0);
                      return (
                        <>
                          {/* En-tête étape 1 */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">Quel est le symptôme ?</p>
                              <span className="text-xs text-muted-foreground">{displayedWithChecks.length} / {displayedPannes.length} avec guide</span>
                            </div>
                            {/* Barre de progression dégradée */}
                            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                              <div className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary" />
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground font-medium">
                              <span className="text-warning-muted-foreground">● Étape 1</span>
                              <span>Vérifications ○</span>
                            </div>
                          </div>

                          {/* Liste des symptômes */}
                          <div className="space-y-2">
                            {displayedPannes.map(panne => {
                              const checks = panneChecksMap[panne.id] || [];
                              const hasChecks = checks.length > 0;
                              const poids = panne.poids || 3;
                              const poidsClass = poids >= 5
                                ? 'bg-destructive text-destructive-foreground'
                                : poids === 4 ? 'bg-warning text-warning-foreground'
                                : poids === 3 ? 'bg-warning-muted text-warning-muted-foreground'
                                : 'bg-info-muted text-info-muted-foreground';
                              return (
                                <button
                                  key={panne.id}
                                  disabled={!hasChecks}
                                  onClick={() => { setWizardPanne(panne); setWizardStep(1); setWizardCheckedIds(new Set()); }}
                                  className={`group w-full text-left rounded-xl border transition-all ${
                                    hasChecks
                                      ? 'border-warning/30 bg-warning-muted hover:border-warning hover:shadow-sm cursor-pointer'
                                      : 'border-muted bg-muted/20 cursor-default opacity-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 px-4 py-3">
                                    <div className={`shrink-0 h-6 w-6 rounded-lg ${poidsClass} flex items-center justify-center`}>
                                      <span className="text-xs font-bold">{poids}</span>
                                    </div>
                                    <span className="flex-1 text-sm font-medium truncate">{panne.description}</span>
                                    {hasChecks ? (
                                      <div className="flex items-center gap-1 text-xs text-warning-muted-foreground shrink-0">
                                        <ListChecks className="h-3.5 w-3.5" />
                                        <span>{checks.length} vérif.</span>
                                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground shrink-0">Aucune vérification</span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {/* En-tête étape 2 */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Vérifications à effectuer</p>
                        <button
                          onClick={() => { setWizardStep(0); setWizardPanne(null); setWizardCheckedIds(new Set()); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" /> Retour aux symptômes
                        </button>
                      </div>
                      {/* Barre dégradée progressive */}
                      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${25 + Math.round((wizardCheckedIds.size / Math.max(wizardChecks.length, 1)) * 75)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground font-medium">
                        <span className="text-primary">● Étape 2</span>
                        <span className={wizardCheckedIds.size === wizardChecks.length ? 'text-success-muted-foreground font-semibold' : ''}>
                          {wizardCheckedIds.size} / {wizardChecks.length} vérifiés
                        </span>
                      </div>
                      {/* Symptôme sélectionné */}
                      <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/15 px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Symptôme&nbsp;:&nbsp;</span>
                        <span className="text-xs font-semibold text-foreground truncate">{wizardPanne?.description}</span>
                      </div>
                    </div>

                    {/* Liste des vérifications */}
                    <div className="space-y-2">
                      {wizardChecks.map((check, idx) => {
                        const isChecked = wizardCheckedIds.has(check.id);
                        return (
                          <button
                            key={check.id}
                            onClick={() => setWizardCheckedIds(prev => {
                              const n = new Set(prev);
                              if (n.has(check.id)) n.delete(check.id); else n.add(check.id);
                              return n;
                            })}
                            className={`w-full text-left rounded-xl border px-4 py-3 flex items-start gap-3 transition-all ${
                              isChecked
                                ? 'bg-success-muted border-success/30 shadow-sm'
                                : 'bg-background border-muted hover:bg-muted/30 hover:border-border'
                            }`}
                          >
                            <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              isChecked
                                ? 'bg-success border-success'
                                : 'border-muted-foreground/30'
                            }`}>
                              {isChecked && <Check className="h-2.5 w-2.5 text-success-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                                {check.description_verification}
                              </p>
                              {check.piece && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Package2 className="h-3 w-3 shrink-0" /> {check.piece.nom}
                                </p>
                              )}
                            </div>
                            <span className={`shrink-0 text-xs font-bold mt-0.5 ${isChecked ? 'text-success-muted-foreground' : 'text-muted-foreground/50'}`}>
                              {idx + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Résumé pièces à traiter */}
                    {wizardCheckedIds.size > 0 && (
                      <div className="rounded-xl border border-success/30 bg-success-muted p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
                            <CheckCheck className="h-3.5 w-3.5 text-success-foreground" />
                          </div>
                          <p className="text-xs font-semibold text-success-muted-foreground">
                            {wizardCheckedIds.size === wizardChecks.length
                              ? 'Toutes les vérifications effectuées'
                              : `${wizardCheckedIds.size} / ${wizardChecks.length} vérifications effectuées`}
                          </p>
                        </div>
                        {uniquePiecesFromChecked.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-success-muted-foreground font-medium uppercase tracking-wide">Pièces à traiter</p>
                            {uniquePiecesFromChecked.map(piece => (
                              <div key={piece.id} className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-card/80 px-3 py-2">
                                <span className="text-sm font-medium truncate">{piece.nom}</span>
                                <div className="flex gap-1 shrink-0">
                                  {selectedItem && canManage && (
                                    <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-success-muted-foreground border-success/30 hover:bg-success-muted" onClick={() => markNettoye(piece, selectedItem)}>
                                      <Sparkles className="mr-1 h-3 w-3" />Nettoyée
                                    </Button>
                                  )}
                                  {selectedItem && canManage && (
                                    <Button size="sm" variant="outline" className="h-6 text-xs px-2 hover:bg-primary/5" onClick={() => { setIsHelpOpen(false); openReplace(piece); }}>
                                      <ArrowRight className="mr-1 h-3 w-3" />Remplacer
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {selectedPieceHelp && helpTab === 'docs' && (
              <div className="space-y-6">
                {selectedPieceHelp.description_aide && (
                  <section className="space-y-1.5">
                    <h4 className="text-sm font-semibold text-foreground">Description</h4>
                    <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-foreground/80">{selectedPieceHelp.description_aide}</p>
                  </section>
                )}

                {/* Types de pannes : liste unique à séparateurs */}
                <section className="space-y-1.5">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning-muted-foreground" aria-hidden="true" /> Types de pannes
                    {pannes.length > 0 && <span className="rounded-pill bg-muted px-2 py-px text-xs font-semibold text-muted-foreground">{pannes.length}</span>}
                  </h4>
                  {pannes.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">Aucune panne renseignée.</p>
                  ) : (
                    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                      {pannes.map((p) => (
                        <li key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                          {p.description}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Procédure : frise d'étapes numérotées */}
                <section className="space-y-1.5">
                  <h4 className="text-sm font-semibold text-foreground">Procédure de réparation</h4>
                  {procedures.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">Aucune procédure renseignée.</p>
                  ) : (
                    <ol className="space-y-0">
                      {procedures.map((p, i) => (
                        <li key={p.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {i < procedures.length - 1 && (
                            <span className="absolute bottom-0 left-3 top-7 w-px bg-border" aria-hidden="true" />
                          )}
                          <span className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                            <p className="whitespace-pre-line text-sm text-foreground">{p.description}</p>
                            {p.image_url && (
                              <img src={p.image_url} alt={`Étape ${i + 1}`} className="max-h-48 rounded-xl border border-border object-contain" />
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog remplacement pièce */}
      <Dialog open={isReplaceOpen} onOpenChange={setIsReplaceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remplacer la pièce — {replacingPiece?.nom}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Seules les pièces <strong>{replacingPiece?.nom}</strong> disponibles en stock sont proposées. La quantité sera décrémentée de 1.
            </p>
            {compatiblePieces.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
                Aucune pièce <strong>{replacingPiece?.nom}</strong> en stock pour ce sous-ensemble.
              </p>
            ) : (
            <div className="space-y-1">
              <Label>Pièce de remplacement</Label>
              <Select value={replacePieceId} onValueChange={setReplacePieceId}>
                <SelectTrigger><SelectValue placeholder="Choisir une pièce..." /></SelectTrigger>
                <SelectContent>
                  {compatiblePieces.map(p => {
                    const sp = stockPiecesById[p.id];
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nom} ({p.reference}) — Stock : {sp?.quantite || 0}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            )}
            {replacePieceId && (
              <div className="rounded-md border border-warning/30 bg-warning-muted px-3 py-2 text-sm text-warning-muted-foreground">
                Le sous-ensemble passera automatiquement à l'état <strong>À tester</strong> après remplacement.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReplaceOpen(false)}>Annuler</Button>
            <Button onClick={confirmReplace} disabled={!replacePieceId || isLoading}>
              {isLoading ? 'Traitement...' : 'Confirmer le remplacement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReparationTerminauxTab;
