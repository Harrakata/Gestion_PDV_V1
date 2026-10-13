import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { getStockDefectueuxRecordIds, regrouperStockDefectueuxActif } from '@/lib/stockDefectueux';
import { AlertTriangle, CheckCircle2, HelpCircle, Package2, Wrench, ArrowRight, FlaskConical, ChevronDown, ChevronRight, ChevronLeft, Sparkles, CheckCheck, Search, X, Check, ListChecks, Stethoscope } from 'lucide-react';

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
  defectueux: { label: 'Défectueux', cls: 'bg-red-100 text-red-800' },
  assigne: { label: 'Assigné', cls: 'bg-blue-100 text-blue-800' },
  a_tester: { label: 'À tester', cls: 'bg-yellow-100 text-yellow-800' },
  repare: { label: 'Réparé', cls: 'bg-green-100 text-green-800' },
};

const StatutBadge = ({ statut }) => {
  const cfg = STATUT_CONFIG[statut] || { label: statut, cls: 'bg-gray-100 text-gray-800' };
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
};

const ReparationTerminauxTab = ({ canManage = true }) => {
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
    const [sRes, pRes, spRes] = await Promise.all([
      supabase.from('stock_defectueux').select('*, agence:agences(nom), intervention:interventions_maintenance(id, type_intervention, commentaire, description_panne, code_panne:codes_pannes(code, libelle), code_intervention:codes_interventions(code, libelle))').neq('statut', 'repare').order('date_entree', { ascending: false }),
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
  }, []);

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

  const showOk = (msg) => toast({ title: msg, className: 'bg-green-500 text-white' });
  const showErr = (msg) => toast({ title: 'Erreur', description: msg, variant: 'destructive' });
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

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
    if (error) { showErr(error.message); return; }
    showOk('Sous-ensemble passé à "À tester".');
    setSelectedItem(prev => prev && itemIds.includes(prev.id) ? { ...prev, statut: 'a_tester' } : prev);
    setStock(prev => prev.map(s => itemIds.includes(s.id) ? { ...s, statut: 'a_tester' } : s));
    setTreatedPieces(prev => { const n = { ...prev }; delete n[item.id]; return n; });
  };

  const markRepare = async (item) => {
    const itemIds = getStockDefectueuxRecordIds(item);
    const { error } = await supabase.from('stock_defectueux').update({ statut: 'repare', date_sortie: new Date().toISOString() }).in('id', itemIds);
    if (error) { showErr(error.message); return; }
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
    if (error) { showErr(error.message); return; }
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
    if (stockError) { showErr(stockError.message); setIsLoading(false); return; }
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

  const compatiblePieces = useMemo(() => {
    if (!replacingPiece || !selectedItem) return [];
    return pieces.filter(p =>
      (p.sous_ensemble === selectedItem.type_sous_ensemble || p.type_terminal === 'tous') &&
      (stockPiecesById[p.id]?.quantite || 0) > 0
    );
  }, [pieces, replacingPiece, selectedItem, stockPiecesById]);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden shadow-xl glassmorphism">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
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
          <Card className="relative overflow-hidden shadow-lg">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
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
                  <button
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
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {isLoading ? 'Chargement...' : 'Aucun sous-ensemble à traiter.'}
                </p>
              ) : (
                <div className="divide-y max-h-[32rem] overflow-y-auto">
                  {filteredStock.map(item => {
                    const isExpanded = expandedItems.has(item.id);
                    const cachedPieces = itemPiecesCache[item.id];
                    const isLoadingExpand = loadingExpandIds.has(item.id);
                    const isSelected = selectedItem?.id === item.id;
                    return (
                      <div key={item.id} className={isSelected ? 'bg-primary/10' : ''}>
                        <div className="flex items-center min-w-0">
                          <button
                            className="flex-1 min-w-0 text-left px-3 py-4 transition-colors hover:bg-muted/50"
                            onClick={() => loadItemDetail(item)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-base font-mono shrink-0">{item.reference_sous_ensemble}</span>
                              <Badge variant="outline" className="text-sm shrink-0">{SOUS_ENSEMBLE_LABELS[item.type_sous_ensemble] || item.type_sous_ensemble}</Badge>
                              {item.type_terminal && <span className="text-sm text-muted-foreground truncate">· {item.type_terminal}</span>}
                            </div>
                          </button>
                          <button
                            className="px-2.5 self-stretch flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors shrink-0"
                            onClick={(e) => openSousEnsembleHelp(item, e)}
                          >
                            <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden xs:inline">Diagnostiquer</span>
                          </button>
                          <button
                            className="px-1.5 self-stretch flex items-center justify-center hover:bg-muted/50 transition-colors text-muted-foreground"
                            title={isExpanded ? 'Réduire' : 'Voir les pièces'}
                            onClick={() => toggleExpand(item)}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 bg-muted/20 space-y-1.5">
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
                                {cachedPieces
                                  .filter(mp => !pieceSearchLower ||
                                    mp.piece?.nom?.toLowerCase().includes(pieceSearchLower) ||
                                    mp.piece?.reference?.toLowerCase().includes(pieceSearchLower)
                                  )
                                  .map(mp => {
                                  const sp = stockPiecesById[mp.piece?.id];
                                  const pieceAction = treatedPieces[item.id]?.[mp.piece?.id];
                                  return (
                                    <div key={mp.id} className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${pieceAction ? 'bg-green-50 border-green-200' : 'bg-background'}`}>
                                      <span className="flex-1 basis-full sm:basis-0 min-w-0 font-medium truncate">{mp.piece?.nom}</span>
                                      {pieceAction && (
                                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${pieceAction === 'nettoyage' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                          {pieceAction === 'nettoyage' ? '✓ Nettoyée' : '✓ Remplacée'}
                                        </span>
                                      )}
                                      {sp && !pieceAction && (
                                        <span className={`text-xs font-mono shrink-0 ${sp.quantite === 0 ? 'text-red-600' : sp.quantite <= (sp.seuil_alerte || 2) ? 'text-yellow-600' : 'text-green-700'}`}>
                                          ×{sp.quantite}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                                {item.statut === 'a_tester' && (
                                  <div className="pt-1.5 border-t border-dashed border-muted-foreground/20">
                                    <p className="text-[10px] text-center text-yellow-700 font-medium">En attente de validation du test</p>
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
            <Card className="relative overflow-hidden flex items-center justify-center py-20">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
              <div className="text-center text-muted-foreground">
                <Package2 className="mx-auto h-12 w-12 mb-3 opacity-30" />
                <p>Sélectionnez un sous-ensemble pour commencer.</p>
              </div>
            </Card>
          ) : (
            <>
              <Card className="relative overflow-hidden shadow-lg">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
                <CardHeader className="relative pb-3">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-lg font-mono">{selectedItem.reference_sous_ensemble}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {SOUS_ENSEMBLE_LABELS[selectedItem.type_sous_ensemble]} — {selectedItem.type_terminal || 'N/A'} — {selectedItem.agence?.nom || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">Entré le {formatDate(selectedItem.date_entree)}</p>
                    </div>
                    <StatutBadge statut={selectedItem.statut} />
                  </div>
                  {(() => {
                    const inv = selectedItem.intervention;
                    const cp = inv?.code_panne || inv?.code_intervention;
                    const commentaire = inv?.commentaire || selectedItem.commentaire;
                    if (!cp && !commentaire) return null;
                    return (
                      <div className="mt-3 space-y-2">
                        {cp && (
                          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-4 flex-wrap">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Code panne</p>
                                  <p className="text-sm font-mono font-bold text-red-800">{cp.code} — {cp.libelle}</p>
                                </div>
                              </div>
                              {inv.description_panne && (
                                <div className="mt-1.5 border-t border-red-200 pt-1.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400">Descriptif panne</p>
                                  <p className="text-sm text-red-800">{inv.description_panne}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {commentaire && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Commentaire</p>
                              <p className="text-sm text-amber-800">{commentaire}</p>
                            </div>
                          </div>
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
                    return (
                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {steps.map((step, index) => (
                          <div
                            key={step.label}
                            className={`min-w-0 rounded-md border px-3 py-2 ${
                              step.done
                                ? 'border-emerald-200 bg-emerald-50'
                                : step.active
                                  ? 'border-primary/40 bg-primary/5'
                                  : 'border-border bg-muted/20'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                step.done
                                  ? 'bg-emerald-500 text-white'
                                  : step.active
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                              }`}>
                                {step.done ? <Check className="h-3 w-3" /> : index + 1}
                              </span>
                              <span className="truncate text-xs font-semibold">{step.label}</span>
                            </div>
                            <p className="mt-1 truncate pl-7 text-[10px] text-muted-foreground">{step.detail}</p>
                          </div>
                        ))}
                      </div>
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
                        className={Object.keys(treatedPieces[selectedItem.id] || {}).length > 0 ? 'bg-yellow-500 text-white border-yellow-500 hover:bg-yellow-600' : 'text-yellow-700 border-yellow-300'}
                        onClick={() => markATester(selectedItem)}
                      >
                        <FlaskConical className="mr-2 h-4 w-4" />
                        Passer en test
                        {Object.keys(treatedPieces[selectedItem.id] || {}).length > 0 && (
                          <span className="ml-1.5 rounded-full bg-white/30 px-1.5 text-[10px] font-bold">
                            {Object.keys(treatedPieces[selectedItem.id]).length}
                          </span>
                        )}
                      </Button>
                    )}
                    {canManage && selectedItem.statut === 'a_tester' && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => markRepare(selectedItem)}>
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
                            <div key={pieceId} className="flex items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 text-xs shadow-sm border border-white">
                              <span className="font-medium truncate">{piece?.nom || `Pièce #${pieceId}`}</span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${action === 'nettoyage' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
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
                <DialogContent className="sm:max-w-3xl w-[min(94vw,52rem)] max-h-[84vh] flex flex-col gap-0 overflow-hidden border-primary/25 p-0 !bg-background !backdrop-blur-none">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-primary" />
                  <div className="relative shrink-0 border-b bg-primary/5 px-6 pb-3 pt-5 pr-14">
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
                          <div key={label} className={`flex min-w-0 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-emerald-50 text-emerald-700' : 'text-muted-foreground'}`}>
                            {done ? <Check className="h-3 w-3" /> : <span>{index + 1}</span>}
                            <span className="truncate">{label}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-1 rounded-md border bg-background p-1">
                      <button
                        type="button"
                        onClick={() => setSeDiagnosticView('guide')}
                        className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold transition-colors ${seDiagnosticView === 'guide' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                      >
                        <Stethoscope className="h-4 w-4" /> Guide diagnostic
                      </button>
                      <button
                        type="button"
                        disabled={!seDiagnosticPanne?.piece}
                        onClick={() => setSeDiagnosticView('documentation')}
                        className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold transition-colors ${
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

                  <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
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
                              className="max-h-64 w-full rounded-md border bg-white object-contain"
                            />
                          </section>
                        )}

                        <section className="border-b pb-4">
                          <h4 className="flex items-center gap-2 text-sm font-semibold">
                            <AlertTriangle className="h-4 w-4 text-amber-500" /> Pannes connues
                          </h4>
                          <div className="mt-2 divide-y rounded-md border bg-background">
                            {seHelpPannes
                              .filter(panne => String(panne.piece_id) === String(seDiagnosticPanne?.piece?.id))
                              .map(panne => (
                                <button
                                  key={panne.id}
                                  type="button"
                                  onClick={() => { selectDiagnosticPanne(panne); setSeDiagnosticView('guide'); }}
                                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40 ${panne.id === seDiagnosticPanne?.id ? 'bg-amber-50 text-amber-900' : ''}`}
                                >
                                  <span className="min-w-0 flex-1">{panne.description}</span>
                                  {panne.id === seDiagnosticPanne?.id && <Badge className="bg-amber-100 text-amber-800">En cours</Badge>}
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
                                      <img src={procedure.image_url} alt={`Étape ${index + 1}`} className="mt-2 max-h-56 w-full rounded-md border bg-white object-contain" />
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
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Aucun modèle n'est associé à ce sous-ensemble.
                      </div>
                    ) : seHelpPannes.length === 0 ? (
                      <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                        Aucun diagnostic n'est configuré pour ce modèle.
                      </div>
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
                            <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                              {sortedPannes.map(panne => {
                                const checks = seHelpChecksMap[panne.id] || [];
                                const recommended = declaredFault && normalize(panne.description) === normalize(declaredFault);
                                return (
                                  <button
                                    key={panne.id}
                                    type="button"
                                    disabled={checks.length === 0}
                                    onClick={() => selectDiagnosticPanne(panne)}
                                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                                      checks.length === 0
                                        ? 'cursor-not-allowed bg-muted/20 opacity-55'
                                        : recommended
                                          ? 'border-amber-300 bg-amber-50 hover:bg-amber-100/70'
                                          : 'bg-background hover:border-primary/30 hover:bg-primary/5'
                                    }`}
                                  >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold ${recommended ? 'bg-amber-500 text-white' : 'bg-primary/10 text-primary'}`}>
                                      {panne.poids || 3}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex flex-wrap items-center gap-2">
                                        <span className="truncate text-sm font-semibold">{panne.piece?.nom || 'Pièce non renseignée'}</span>
                                        {recommended && <Badge className="bg-amber-100 text-amber-800">Panne déclarée</Badge>}
                                      </span>
                                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{panne.description}</span>
                                    </span>
                                    <span className="shrink-0 text-[11px] text-muted-foreground">{checks.length} contrôle{checks.length > 1 ? 's' : ''}</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  </button>
                                );
                              })}
                            </div>
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
                                className={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${checked ? 'border-emerald-300 bg-emerald-50' : 'bg-background hover:bg-muted/30'}`}
                              >
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/30'}`}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm">{check.description_verification}</span>
                                  {check.piece && <span className="mt-0.5 block text-[11px] text-muted-foreground">Pièce concernée : {check.piece.nom}</span>}
                                </span>
                                <span className="text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
                              </button>
                            );
                          })}
                        </div>

                        {seDiagnosticCheckedIds.size > 0 && (
                          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-emerald-800">Résultat du diagnostic</p>
                              <span className="text-[11px] text-emerald-700">{seDiagnosticCheckedIds.size}/{seDiagnosticChecks.length} contrôles</span>
                            </div>
                            {seDiagnosticPieces.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Aucune pièce spécifique n'est liée aux contrôles sélectionnés.</p>
                            ) : seDiagnosticPieces.map(piece => {
                              const action = treatedPieces[selectedItem.id]?.[piece.id];
                              return (
                                <div key={piece.id} className="flex flex-wrap items-center gap-2 border-t border-emerald-200 pt-2 first:border-t-0 first:pt-0">
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{piece.nom}</span>
                                  {action ? (
                                    <Badge className="bg-emerald-100 text-emerald-800">{action === 'nettoyage' ? 'Nettoyée' : 'Remplacée'}</Badge>
                                  ) : canManage ? (
                                    <>
                                      <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700" onClick={() => markNettoye(piece, selectedItem)}>
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
                            <p className="mt-1 text-[10px] text-muted-foreground">Cochez les contrôles réellement effectués.</p>
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
              {(itemPieces.length > 0 || selectedItem.modele_id) && (
                <Card className="relative overflow-hidden shadow-lg">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
                  <CardHeader className="relative py-2 px-4">
                    <CardTitle className="flex items-center gap-2 text-sm text-primary">
                      <Wrench className="h-3.5 w-3.5" /> Pièces du modèle
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0 space-y-1.5 max-h-[22rem] overflow-y-auto">
                    {itemPieces.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune pièce référencée.</p>
                    ) : itemPieces.map(mp => {
                      const sp = stockPiecesById[mp.piece?.id];
                      return (
                        <div key={mp.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border bg-background/60 px-3 py-1.5 text-xs">
                          <div className="flex-1 basis-full sm:basis-0 min-w-0 truncate">
                            <span className="font-medium">{mp.piece?.nom}</span>
                            <span className="ml-2 font-mono text-muted-foreground">{mp.piece?.reference}</span>
                          </div>
                          <span className="text-muted-foreground shrink-0">×{mp.quantite}</span>
                          {sp ? (
                            <span className={`font-semibold shrink-0 ${sp.quantite === 0 ? 'text-red-600' : sp.quantite <= (sp.seuil_alerte || 2) ? 'text-yellow-600' : 'text-green-700'}`}>
                              Stock: {sp.quantite}
                            </span>
                          ) : <span className="text-muted-foreground shrink-0">Non suivi</span>}
                          {mp.piece && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-primary shrink-0" title="Aide réparation" onClick={() => loadPieceHelp(mp.piece)}>
                              <HelpCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canManage && mp.piece && (
                            <>
                              <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-green-700 border-green-300 shrink-0" onClick={() => markNettoye(mp.piece, selectedItem)}>
                                <Sparkles className="mr-1 h-3 w-3" />Nettoyée
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-xs px-2 shrink-0" onClick={() => openReplace(mp.piece)}>
                                <ArrowRight className="mr-1 h-3 w-3" />Remplacer
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialog aide réparation */}
      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent className="sm:max-w-lg w-full flex flex-col h-[62vh] p-0 gap-0 overflow-hidden !rounded-2xl">

          {/* Bande de couleur supérieure */}
          <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />

          {/* Header */}
          <div className="shrink-0 px-6 pt-5 pb-0 border-b bg-gradient-to-b from-primary/8 to-white">
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
                  className="shrink-0 flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" /> Formulaire Diagnostique
                </button>
              )}
            </div>

            {/* Filtre actif */}
            {wizardFilter && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-2.5 py-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                <span className="text-[11px] text-amber-700">Filtré sur&nbsp;: <span className="font-semibold">{wizardFilter}</span></span>
                <button onClick={() => setWizardFilter(null)} className="ml-auto text-amber-400 hover:text-amber-600 transition-colors"><X className="h-3 w-3" /></button>
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
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
                    <ListChecks className="h-10 w-10 opacity-25" />
                    <div>
                      <p className="text-sm font-medium">Aucun guide de diagnostic configuré.</p>
                      <p className="text-xs mt-1">Ajoutez des types de pannes avec leurs vérifications dans Exploitation → Aide à la Réparation.</p>
                    </div>
                    <button onClick={() => setHelpTab('docs')} className="text-xs text-primary underline">Voir la documentation</button>
                  </div>
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
                              <span className="text-[11px] text-muted-foreground">{displayedWithChecks.length} / {displayedPannes.length} avec guide</span>
                            </div>
                            {/* Barre de progression dégradée */}
                            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                              <div className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-gradient-to-r from-amber-400 to-primary" />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                              <span className="text-amber-500">● Étape 1</span>
                              <span>Vérifications ○</span>
                            </div>
                          </div>

                          {/* Liste des symptômes */}
                          <div className="space-y-2">
                            {displayedPannes.map(panne => {
                              const checks = panneChecksMap[panne.id] || [];
                              const hasChecks = checks.length > 0;
                              const poids = panne.poids || 3;
                              const poidsGrad = poids >= 5
                                ? 'from-red-500 to-red-400'
                                : poids === 4 ? 'from-orange-500 to-amber-400'
                                : poids === 3 ? 'from-amber-400 to-yellow-300'
                                : 'from-blue-400 to-sky-300';
                              return (
                                <button
                                  key={panne.id}
                                  disabled={!hasChecks}
                                  onClick={() => { setWizardPanne(panne); setWizardStep(1); setWizardCheckedIds(new Set()); }}
                                  className={`group w-full text-left rounded-xl border transition-all ${
                                    hasChecks
                                      ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/40 hover:from-amber-100 hover:to-orange-50 hover:border-amber-300 hover:shadow-sm cursor-pointer'
                                      : 'border-muted bg-muted/20 cursor-default opacity-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 px-4 py-3">
                                    <div className={`shrink-0 h-6 w-6 rounded-lg bg-gradient-to-br ${poidsGrad} flex items-center justify-center`}>
                                      <span className="text-[10px] font-bold text-white">{poids}</span>
                                    </div>
                                    <span className="flex-1 text-sm font-medium truncate">{panne.description}</span>
                                    {hasChecks ? (
                                      <div className="flex items-center gap-1 text-xs text-amber-600 shrink-0">
                                        <ListChecks className="h-3.5 w-3.5" />
                                        <span>{checks.length} vérif.</span>
                                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground shrink-0">Aucune vérification</span>
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
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-cyan-500 transition-all duration-300"
                          style={{ width: `${25 + Math.round((wizardCheckedIds.size / Math.max(wizardChecks.length, 1)) * 75)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                        <span className="text-primary">● Étape 2</span>
                        <span className={wizardCheckedIds.size === wizardChecks.length ? 'text-green-600 font-semibold' : ''}>
                          {wizardCheckedIds.size} / {wizardChecks.length} vérifiés
                        </span>
                      </div>
                      {/* Symptôme sélectionné */}
                      <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/15 px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
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
                                ? 'bg-gradient-to-r from-green-50 to-emerald-50/60 border-green-300 shadow-sm'
                                : 'bg-background border-muted hover:bg-muted/30 hover:border-border'
                            }`}
                          >
                            <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              isChecked
                                ? 'bg-gradient-to-br from-green-400 to-emerald-500 border-green-400'
                                : 'border-muted-foreground/30'
                            }`}>
                              {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm leading-snug ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                                {check.description_verification}
                              </p>
                              {check.piece && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Package2 className="h-3 w-3 shrink-0" /> {check.piece.nom}
                                </p>
                              )}
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold mt-0.5 ${isChecked ? 'text-green-600' : 'text-muted-foreground/50'}`}>
                              {idx + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Résumé pièces à traiter */}
                    {wizardCheckedIds.size > 0 && (
                      <div className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/40 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-500">
                            <CheckCheck className="h-3.5 w-3.5 text-white" />
                          </div>
                          <p className="text-xs font-semibold text-green-800">
                            {wizardCheckedIds.size === wizardChecks.length
                              ? 'Toutes les vérifications effectuées'
                              : `${wizardCheckedIds.size} / ${wizardChecks.length} vérifications effectuées`}
                          </p>
                        </div>
                        {uniquePiecesFromChecked.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] text-green-700 font-medium uppercase tracking-wide">Pièces à traiter</p>
                            {uniquePiecesFromChecked.map(piece => (
                              <div key={piece.id} className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-white/80 px-3 py-2">
                                <span className="text-sm font-medium truncate">{piece.nom}</span>
                                <div className="flex gap-1 shrink-0">
                                  {selectedItem && canManage && (
                                    <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-green-700 border-green-300 hover:bg-green-50" onClick={() => markNettoye(piece, selectedItem)}>
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
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold">Description</Label>
                    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{selectedPieceHelp.description_aide}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Types de pannes
                  </Label>
                  {pannes.length === 0 && <p className="text-sm text-muted-foreground">Aucune panne renseignée.</p>}
                  {pannes.map(p => (
                    <div key={p.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{p.description}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Procédure de réparation</Label>
                  {procedures.length === 0 && <p className="text-sm text-muted-foreground">Aucune procédure.</p>}
                  {procedures.map((p, i) => (
                    <div key={p.id} className="rounded-md border p-3 space-y-2">
                      <span className="font-medium text-primary text-sm">Étape {i + 1}</span>
                      <p className="text-sm">{p.description}</p>
                      {p.image_url && <img src={p.image_url} alt={`Étape ${i + 1}`} className="max-h-48 rounded border object-contain" />}
                    </div>
                  ))}
                </div>
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
              Sélectionnez la pièce de remplacement dans le stock disponible. La quantité sera décrémentée de 1.
            </p>
            <div className="space-y-1">
              <Label>Pièce de remplacement</Label>
              <Select value={replacePieceId} onValueChange={setReplacePieceId}>
                <SelectTrigger><SelectValue placeholder="Choisir une pièce..." /></SelectTrigger>
                <SelectContent>
                  {compatiblePieces.length === 0 && <SelectItem value="__none__" disabled>Aucune pièce compatible en stock</SelectItem>}
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
            {replacePieceId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
