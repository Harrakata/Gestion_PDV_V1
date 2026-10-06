import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Edit, FileUp, MapPinned, PackageCheck, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/Combobox';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { buildRegionOptions, fetchRegions, normalizeRegionText } from '@/lib/regions';
import { fetchSecteurs, buildSecteurOptions } from '@/lib/secteurs';
import { supabase } from '@/lib/supabaseClient';
import { isSupabaseAuthError } from '@/lib/guichetiereSpace';
import EquipmentManager from './EquipmentManager';

const ALL_FILTER_VALUE = '__all__';

const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeCsvHeader = (value) =>
  normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const BLOCKED_EQUIPMENT_STATUSES = new Set(['en panne', 'hors service']);
const isEquipmentAvailableStatus = (status) => !BLOCKED_EQUIPMENT_STATUSES.has(normalizeText(status));

const DEFAULT_FORM_DATA = {
  ref: '',
  type: '2020',
  position: '',
  ip: '',
  imprimante: '',
  lecteur: '',
  ecran: '',
  afficheur: '',
  buc: '',
  alimentation: '',
  boutonMarcheArret: '',
  afficheurTerminal: '',
  circuitAfficheurClient: '',
  circuitBacUc: '',
  carteMereBacUc: '',
  ssd: '',
};

const EQUIPMENT_FIELD_CONFIG = [
  {
    formKey: 'imprimante',
    pluralKey: 'imprimantes',
    terminalKey: 'imprimante_reference',
    table: 'equipments_imprimantes',
    label: 'Imprimante',
  },
  {
    formKey: 'lecteur',
    pluralKey: 'lecteurs',
    terminalKey: 'lecteur_reference',
    table: 'equipments_lecteurs',
    label: 'Lecteur',
  },
  {
    formKey: 'ecran',
    pluralKey: 'ecrans',
    terminalKey: 'ecran_reference',
    table: 'equipments_ecrans',
    label: 'Écran',
  },
  {
    formKey: 'afficheur',
    pluralKey: 'afficheurs',
    terminalKey: 'afficheur_reference',
    table: 'equipments_afficheurs',
    label: 'Afficheur client',
  },
  {
    formKey: 'buc',
    pluralKey: 'bucs',
    terminalKey: 'buc_reference',
    table: 'equipments_bucs',
    label: 'BUC',
  },
  {
    formKey: 'alimentation',
    pluralKey: 'alimentations',
    terminalKey: 'alimentation_reference',
    table: 'equipments_alimentations',
    label: 'Alimentation',
  },
  {
    formKey: 'boutonMarcheArret',
    pluralKey: 'boutonsMarcheArret',
    terminalKey: 'bouton_marche_arret_reference',
    table: 'equipments_boutons_marche_arret',
    label: 'Bouton marche/arrêt',
  },
  {
    formKey: 'afficheurTerminal',
    pluralKey: 'afficheursTerminal',
    terminalKey: 'afficheur_terminal_reference',
    table: 'equipments_afficheurs_terminal',
    label: 'Afficheur',
  },
  {
    formKey: 'circuitAfficheurClient',
    pluralKey: 'circuitsAfficheurClient',
    terminalKey: 'circuit_afficheur_client_reference',
    table: 'equipments_circuits_afficheur_client',
    label: 'Circuit afficheur client',
  },
  {
    formKey: 'circuitBacUc',
    pluralKey: 'circuitsBacUc',
    terminalKey: 'circuit_bac_uc_reference',
    table: 'equipments_circuits_bac_uc',
    label: 'Circuit BAC UC',
  },
  {
    formKey: 'carteMereBacUc',
    pluralKey: 'cartesMeresBacUc',
    terminalKey: 'carte_mere_bac_uc_reference',
    table: 'equipments_cartes_meres_bac_uc',
    label: 'Carte mère BAC UC',
  },
  {
    formKey: 'ssd',
    pluralKey: 'ssds',
    terminalKey: 'ssd_reference',
    table: 'equipments_ssd',
    label: 'SSD',
  },
];

const ASSEMBLED_TERMINAL_FIELD_CONFIG = [
  { header: 'ID_TRM', dbKey: 'reference', aliases: ['id_trm', 'id trm', 'reference'] },
  { header: 'MAC ADRESS', dbKey: 'mac_address', aliases: ['mac adress', 'mac address', 'mac_adress', 'mac_address'] },
  { header: 'ECRAN', dbKey: 'ecran_reference', aliases: ['ecran', 'ecran_reference'] },
  { header: 'ALIMENTATION', dbKey: 'alimentation_reference', aliases: ['alimentation', 'alimentation_reference'] },
  { header: 'BAC UC', dbKey: 'buc_reference', aliases: ['bac uc', 'buc', 'buc_reference'] },
  { header: 'LECTEUR', dbKey: 'lecteur_reference', aliases: ['lecteur', 'lecteur_reference'] },
  {
    header: 'BOUTON MARCHE/ARRET',
    dbKey: 'bouton_marche_arret_reference',
    aliases: ['bouton marche/arret', 'bouton marche arret', 'bouton_marche_arret_reference'],
  },
  {
    header: 'AFFICHEUR CLIENT',
    dbKey: 'afficheur_reference',
    aliases: ['afficheur_reference'],
    legacyHeaders: [{ header: 'AFFICHEUR', occurrence: 1 }],
  },
  { header: 'IMPRIMANTE', dbKey: 'imprimante_reference', aliases: ['imprimante', 'imprimante_reference'] },
  {
    header: 'CIRCUIT AFFICHEUR CLIENT',
    dbKey: 'circuit_afficheur_client_reference',
    aliases: ['circuit afficheur client', 'circuit_afficheur_client_reference'],
  },
  {
    header: 'CIRCUIT BAC UC',
    dbKey: 'circuit_bac_uc_reference',
    aliases: ['circuit bac uc', 'circuit_bac_uc_reference'],
  },
  {
    header: 'CARTE MERE BAC UC',
    dbKey: 'carte_mere_bac_uc_reference',
    aliases: ['carte mere bac uc', 'carte mère bac uc', 'carte_mere_bac_uc_reference'],
  },
  { header: 'SSD', dbKey: 'ssd_reference', aliases: ['ssd', 'ssd_reference'] },
  {
    header: 'AFFICHEUR TERMINAL',
    dbKey: 'afficheur_terminal_reference',
    aliases: ['afficheur terminal', 'afficheur_terminal_reference'],
    legacyHeaders: [{ header: 'AFFICHEUR', occurrence: 2 }],
  },
  { header: 'IDENTIFIANT', dbKey: 'identifiant', aliases: ['identifiant'] },
  { header: 'N° SECU', dbKey: 'numero_secu', aliases: ['n secu', 'n° secu', 'no secu', 'numero secu', 'numero_secu'] },
];

const ASSEMBLED_TERMINAL_HEADERS = ASSEMBLED_TERMINAL_FIELD_CONFIG.map((field) => field.header);
const ASSEMBLED_EQUIPMENT_FIELD_CONFIG = ASSEMBLED_TERMINAL_FIELD_CONFIG.filter((field) =>
  EQUIPMENT_FIELD_CONFIG.some((equipment) => equipment.terminalKey === field.dbKey)
);

const isMissingTableError = (error) =>
  error?.code === 'PGRST205' || /could not find the table/i.test(error?.message || '');

const findHeaderIndex = (normalizedHeaders, header, occurrence = 1) => {
  const normalizedHeader = normalizeCsvHeader(header);
  let currentOccurrence = 0;

  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    if (normalizedHeaders[index] !== normalizedHeader) continue;
    currentOccurrence += 1;
    if (currentOccurrence === occurrence) return index;
  }

  return -1;
};

const findCsvFieldIndex = (normalizedHeaders, fieldConfig) => {
  const directHeaders = [fieldConfig.header, ...(fieldConfig.aliases || [])];
  for (const header of directHeaders) {
    const index = findHeaderIndex(normalizedHeaders, header);
    if (index >= 0) return index;
  }

  for (const legacyHeader of fieldConfig.legacyHeaders || []) {
    const index = findHeaderIndex(normalizedHeaders, legacyHeader.header, legacyHeader.occurrence || 1);
    if (index >= 0) return index;
  }

  return -1;
};

const getCsvFieldValue = (values, normalizedHeaders, fieldConfig) => {
  const index = findCsvFieldIndex(normalizedHeaders, fieldConfig);
  return index >= 0 ? String(values[index] ?? '').trim() : '';
};

const readSpreadsheetRows = async (file) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  return XLSX.utils
    .sheet_to_json(workbook.Sheets[firstSheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    })
    .map((row) => row.map((value) => String(value ?? '').trim()))
    .filter((row) => row.some(Boolean));
};

const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsvFile = (fileName, rows) => {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const mapAssembledTerminalToFormData = (terminal, previousState = DEFAULT_FORM_DATA) => ({
  ...previousState,
  ref: terminal?.reference || '',
  type: terminal?.type_terminal || previousState.type || '2020',
  ip: terminal?.adresse_ip || '',
  ...EQUIPMENT_FIELD_CONFIG.reduce((accumulator, config) => {
    accumulator[config.formKey] = terminal?.[config.terminalKey] || '';
    return accumulator;
  }, {}),
});

const getTerminalStatusBadgeClass = (status) => {
  const normalizedStatus = normalizeText(status);

  if (normalizedStatus === 'actif') {
    return 'border-green-200 bg-green-50 text-green-700';
  }

  if (normalizedStatus === 'en maintenance') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (normalizedStatus === 'hors service') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const ConfigurationTab = ({
  canManage = true,
  lockedAgenceId = null,
  lockedAgenceName = '',
  showEquipmentManagement = true,
  readOnlyMessage = '',
}) => {
  const { toast } = useToast();
  const assembledImportInputRef = useRef(null);
  const [regions, setRegions] = useState([]);
  const [agences, setAgences] = useState([]);
  const [secteurs, setSecteurs] = useState([]);
  const [equipments, setEquipments] = useState({
    imprimantes: [],
    ecrans: [],
    lecteurs: [],
    afficheurs: [],
    bucs: [],
    alimentations: [],
    boutonsMarcheArret: [],
    afficheursTerminal: [],
    circuitsAfficheurClient: [],
    circuitsBacUc: [],
    cartesMeresBacUc: [],
    ssds: [],
  });
  const [agenceId, setAgenceId] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formSecteur, setFormSecteur] = useState('');
  const [terminaux, setTerminaux] = useState([]);
  const [assembledTerminals, setAssembledTerminals] = useState([]);
  const [expandedAssembledTerminalId, setExpandedAssembledTerminalId] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [configurationMode, setConfigurationMode] = useState('manual');
  const [selectedAssembledTerminalId, setSelectedAssembledTerminalId] = useState('');
  const [editingTerminalId, setEditingTerminalId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  // Filtres multi-sélection : tableaux de valeurs (vide = tout afficher).
  const [parkFilters, setParkFilters] = useState({
    region: [],
    secteur: [],
    agenceId: [],
    type: [],
    statut: [],
    search: '',
  });


  const loadData = useCallback(async () => {
    setIsLoading(true);

    try {
      const [
        regionsResponse,
        agencesResponse,
        secteursResponse,
        terminauxResponse,
        imprimantesResponse,
        ecransResponse,
        lecteursResponse,
        afficheurResponse,
        bucsResponse,
        alimentationsResponse,
        boutonsMarcheArretResponse,
        afficheursTerminalResponse,
        circuitsAfficheurClientResponse,
        circuitsBacUcResponse,
        cartesMeresBacUcResponse,
        ssdsResponse,
        assembledTerminalsResponse,
      ] = await Promise.all([
        fetchRegions(),
        supabase.from('agences').select('id, nom, nbreTerminaux, codePDV, region, secteur').eq('is_current', true).order('nom', { ascending: true }),
        fetchSecteurs(),
        supabase
          .from('terminaux')
          .select(
            'id, reference, type_terminal, position, adresse_ip, agence_id, imprimante_reference, lecteur_reference, ecran_reference, afficheur_reference, buc_reference, alimentation_reference, bouton_marche_arret_reference, afficheur_terminal_reference, circuit_afficheur_client_reference, circuit_bac_uc_reference, carte_mere_bac_uc_reference, ssd_reference, statut'
          )
          .order('reference', { ascending: true }),
        supabase.from('equipments_imprimantes').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_ecrans').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_lecteurs').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_afficheurs').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_bucs').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_alimentations').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_boutons_marche_arret').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_afficheurs_terminal').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_circuits_afficheur_client').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_circuits_bac_uc').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_cartes_meres_bac_uc').select('*').order('reference', { ascending: true }),
        supabase.from('equipments_ssd').select('*').order('reference', { ascending: true }),
        supabase.from('terminaux_assembles').select('*').order('reference', { ascending: true }),
      ]);

      if (regionsResponse.error) {
        if (!isSupabaseAuthError(regionsResponse.error)) {
          toast({
            title: 'Erreur chargement régions',
            description: regionsResponse.error.message,
            variant: 'destructive',
          });
        }
      } else {
        setRegions(regionsResponse.data || []);
      }

      if (agencesResponse.error) {
        if (!isSupabaseAuthError(agencesResponse.error)) {
          toast({
            title: 'Erreur chargement agences',
            description: agencesResponse.error.message,
            variant: 'destructive',
          });
        }
      } else {
        setAgences(agencesResponse.data || []);
      }

      if (!secteursResponse?.error) {
        setSecteurs(secteursResponse.data || []);
      }

      if (terminauxResponse.error) {
        if (!isSupabaseAuthError(terminauxResponse.error)) {
          toast({
            title: 'Erreur chargement terminaux',
            description: terminauxResponse.error.message,
            variant: 'destructive',
          });
        }
      } else {
        // Auto-réparation : terminaux orphelins (agence_id pointant vers une agence archivée
        // suite à un renommage SCD2). On retrouve le successeur via le codePDV identique.
        let terminauxData = terminauxResponse.data || [];
        const currentAgences = agencesResponse.data || [];
        const currentAgenceIds = new Set(currentAgences.map((a) => String(a.id)));
        const currentByCodePdv = new Map(
          currentAgences.filter((a) => a.codePDV).map((a) => [a.codePDV, a])
        );
        const orphanIds = [
          ...new Set(
            terminauxData
              .filter((t) => t.agence_id && !currentAgenceIds.has(String(t.agence_id)))
              .map((t) => t.agence_id)
          ),
        ];
        if (orphanIds.length > 0) {
          const { data: archived } = await supabase
            .from('agences').select('id, codePDV').in('id', orphanIds);
          const heals = (archived || [])
            .map((a) => ({ oldId: a.id, successor: currentByCodePdv.get(a.codePDV) }))
            .filter((h) => h.successor && String(h.successor.id) !== String(h.oldId));

          if (heals.length > 0) {
            const results = await Promise.all(
              heals.map((h) =>
                supabase.from('terminaux').update({ agence_id: h.successor.id }).eq('agence_id', h.oldId)
              )
            );
            const healErr = results.find((r) => r.error)?.error;
            if (!healErr) {
              const fixedCount = terminauxData.filter(
                (t) => heals.some((h) => String(h.oldId) === String(t.agence_id))
              ).length;
              terminauxData = terminauxData.map((t) => {
                const heal = heals.find((h) => String(h.oldId) === String(t.agence_id));
                return heal ? { ...t, agence_id: heal.successor.id } : t;
              });
              toast({
                title: 'Terminaux réattribués',
                description: `${fixedCount} terminal(aux) ré-affecté(s) suite à un renommage d'agence.`,
                className: 'bg-blue-500 text-white',
              });
            }
          }
        }
        setTerminaux(terminauxData);
      }

      const equipmentResponses = [
        { key: 'imprimantes', response: imprimantesResponse },
        { key: 'ecrans', response: ecransResponse },
        { key: 'lecteurs', response: lecteursResponse },
        { key: 'afficheurs', response: afficheurResponse },
        { key: 'bucs', response: bucsResponse },
        { key: 'alimentations', response: alimentationsResponse },
        { key: 'boutonsMarcheArret', response: boutonsMarcheArretResponse },
        { key: 'afficheursTerminal', response: afficheursTerminalResponse },
        { key: 'circuitsAfficheurClient', response: circuitsAfficheurClientResponse },
        { key: 'circuitsBacUc', response: circuitsBacUcResponse },
        { key: 'cartesMeresBacUc', response: cartesMeresBacUcResponse },
        { key: 'ssds', response: ssdsResponse },
      ];

      const equipmentData = {};
      equipmentResponses.forEach(({ key, response }) => {
        if (response.error) {
          toast({
            title: `Erreur chargement ${key}`,
            description: response.error.message,
            variant: 'destructive',
          });
          equipmentData[key] = [];
        } else {
          equipmentData[key] = response.data || [];
        }
      });

      setEquipments(equipmentData);

      if (assembledTerminalsResponse.error) {
        if (!isMissingTableError(assembledTerminalsResponse.error)) {
          toast({
            title: 'Erreur chargement terminaux assemblés',
            description: assembledTerminalsResponse.error.message,
            variant: 'destructive',
          });
        }
        setAssembledTerminals([]);
      } else {
        setAssembledTerminals(assembledTerminalsResponse.data || []);
      }
    } catch (error) {
      console.error('Erreur chargement configuration terminaux:', error);
      toast({
        title: 'Erreur de chargement',
        description: 'Impossible de charger les données.',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const agenciesById = useMemo(
    () =>
      agences.reduce((accumulator, agence) => {
        accumulator[String(agence.id)] = agence;
        return accumulator;
      }, {}),
    [agences]
  );

  const resolvedLockedAgence = useMemo(() => {
    if (lockedAgenceId) {
      return agences.find((agence) => String(agence.id) === String(lockedAgenceId)) || null;
    }

    if (lockedAgenceName) {
      return agences.find((agence) => normalizeText(agence.nom) === normalizeText(lockedAgenceName)) || null;
    }

    return null;
  }, [agences, lockedAgenceId, lockedAgenceName]);

  const resetForm = useCallback(() => {
    setFormData(DEFAULT_FORM_DATA);
    setConfigurationMode('manual');
    setSelectedAssembledTerminalId('');
    setEditingTerminalId(null);
    setIsEditDialogOpen(false);

    if (resolvedLockedAgence?.id) {
      setAgenceId(String(resolvedLockedAgence.id));
      setFormRegion(resolvedLockedAgence.region || '');
      return;
    }

    setAgenceId('');
    setFormRegion('');
  }, [resolvedLockedAgence]);

  useEffect(() => {
    if (resolvedLockedAgence?.id) {
      setAgenceId(String(resolvedLockedAgence.id));
      setFormRegion(resolvedLockedAgence.region || '');
      setParkFilters((previousState) => ({
        ...previousState,
        region: resolvedLockedAgence.region ? [resolvedLockedAgence.region] : [],
        agenceId: [String(resolvedLockedAgence.id)],
      }));
    }
  }, [resolvedLockedAgence]);

  const derivedRegionsFromAgences = useMemo(
    () =>
      agences
        .filter((agence) => agence.region)
        .map((agence) => ({ nom: agence.region, codeRegion: '' })),
    [agences]
  );

  const regionSource = regions.length > 0 ? regions : derivedRegionsFromAgences;

  const regionOptions = useMemo(() => buildRegionOptions(regionSource), [regionSource]);
  const parkRegionOptions = useMemo(
    () => buildRegionOptions(regionSource, { includeAllLabel: 'Régions' }),
    [regionSource]
  );

  const terminauxByAgence = useMemo(
    () =>
      terminaux.reduce((accumulator, terminal) => {
        const agencyKey = String(terminal.agence_id ?? '');
        if (!accumulator[agencyKey]) {
          accumulator[agencyKey] = [];
        }
        accumulator[agencyKey].push(terminal);
        return accumulator;
      }, {}),
    [terminaux]
  );

  const filteredAgencesForForm = useMemo(() => {
    if (!formRegion) {
      return resolvedLockedAgence ? [resolvedLockedAgence] : [];
    }

    return agences
      .filter((agence) => normalizeRegionText(agence.region) === normalizeRegionText(formRegion))
      .filter((agence) => !formSecteur || normalizeRegionText(agence.secteur) === normalizeRegionText(formSecteur));
  }, [agences, formRegion, formSecteur, resolvedLockedAgence]);

  // Secteurs disponibles pour la région choisie (depuis la table secteurs)
  const secteurOptionsForForm = useMemo(
    () => buildSecteurOptions(secteurs, { region: formRegion || null }),
    [secteurs, formRegion]
  );

  const agencesOptions = useMemo(
    () =>
      filteredAgencesForForm.map((agence) => ({
        value: String(agence.id),
        label: `${agence.nom}${agence.codePDV ? ` • ${agence.codePDV}` : ''} (${(terminauxByAgence[String(agence.id)] || []).length}${Number.isFinite(Number(agence.nbreTerminaux)) ? ` / ${Number(agence.nbreTerminaux)}` : ''} terminaux)`,
      })),
    [filteredAgencesForForm, terminauxByAgence]
  );

  const selectedAgency = agenceId ? agenciesById[String(agenceId)] || null : null;
  const selectedAgencyTerminalCount = selectedAgency
    ? (terminauxByAgence[String(selectedAgency.id)] || []).length
    : 0;
  const suggestedAgencyPosition = useMemo(() => {
    if (!agenceId) return '';
    const occupiedPositions = new Set(
      (terminauxByAgence[String(agenceId)] || [])
        .map((terminal) => String(terminal.position || '').match(/^guichet\s+(\d+)$/i)?.[1])
        .filter(Boolean)
        .map(Number)
    );
    let positionNumber = 1;
    while (occupiedPositions.has(positionNumber)) positionNumber += 1;
    return `Guichet ${positionNumber}`;
  }, [agenceId, terminauxByAgence]);
  const selectedAgencyTerminalLimit = selectedAgency?.nbreTerminaux;
  const hasSelectedAgencyTerminalLimit =
    selectedAgencyTerminalLimit !== null &&
    selectedAgencyTerminalLimit !== undefined &&
    selectedAgencyTerminalLimit !== '' &&
    Number.isFinite(Number(selectedAgencyTerminalLimit));
  const normalizedSelectedAgencyTerminalLimit = hasSelectedAgencyTerminalLimit
    ? Number(selectedAgencyTerminalLimit)
    : null;

  const editingTerminal = useMemo(
    () =>
      editingTerminalId
        ? terminaux.find((terminal) => String(terminal.id) === String(editingTerminalId)) || null
        : null,
    [editingTerminalId, terminaux]
  );

  const isEditingOnSameAgency =
    Boolean(editingTerminalId) &&
    String(editingTerminal?.agence_id ?? '') === String(selectedAgency?.id ?? '');
  const selectedAgencyHasReachedCapacity =
    hasSelectedAgencyTerminalLimit &&
    !isEditingOnSameAgency &&
    selectedAgencyTerminalCount >= normalizedSelectedAgencyTerminalLimit;
  const selectedAssembledTerminal = useMemo(
    () =>
      selectedAssembledTerminalId
        ? assembledTerminals.find((terminal) => String(terminal.id) === String(selectedAssembledTerminalId)) || null
        : null,
    [assembledTerminals, selectedAssembledTerminalId]
  );
  const availableAssembledTerminalOptions = useMemo(
    () =>
      assembledTerminals
        .filter(
          (terminal) =>
            normalizeText(terminal.statut) !== 'assigne' ||
            String(terminal.id) === String(selectedAssembledTerminalId)
        )
        .map((terminal) => ({
          value: String(terminal.id),
          label: `${terminal.reference}${terminal.mac_address ? ` • ${terminal.mac_address}` : ''}${
            terminal.identifiant ? ` • ${terminal.identifiant}` : ''
          }`,
        })),
    [assembledTerminals, selectedAssembledTerminalId]
  );

  useEffect(() => {
    if (configurationMode !== 'assembled' || !selectedAssembledTerminal) {
      return;
    }

    setFormData((previousState) => mapAssembledTerminalToFormData(selectedAssembledTerminal, previousState));
  }, [configurationMode, selectedAssembledTerminal]);

  useEffect(() => {
    if (!agenceId || editingTerminalId || !suggestedAgencyPosition) return;
    setFormData((previousState) =>
      previousState.position
        ? previousState
        : { ...previousState, position: suggestedAgencyPosition }
    );
  }, [agenceId, editingTerminalId, suggestedAgencyPosition]);

  useEffect(() => {
    if (!agenceId || resolvedLockedAgence) {
      return;
    }

    const currentAgency = agenciesById[String(agenceId)];
    if (!currentAgency) {
      setAgenceId('');
      return;
    }

    if (formRegion && normalizeRegionText(currentAgency.region) !== normalizeRegionText(formRegion)) {
      setAgenceId('');
    }
  }, [agenceId, agenciesById, formRegion, resolvedLockedAgence]);

  const showReadOnlyToast = () => {
    toast({
      title: 'Lecture seule',
      description: readOnlyMessage || 'La configuration des terminaux est en lecture seule sur cet écran.',
      variant: 'destructive',
    });
  };

  const assignedEquipmentReferences = useMemo(
    () => {
      const referencesByEquipment = [...terminaux
        .filter((terminal) => String(terminal.id) !== String(editingTerminalId ?? '')), ...assembledTerminals]
        .reduce(
          (accumulator, terminal) => {
            EQUIPMENT_FIELD_CONFIG.forEach((config) => {
              if (terminal[config.terminalKey]) {
                accumulator[config.pluralKey].add(normalizeText(terminal[config.terminalKey]));
              }
            });
            return accumulator;
          },
          EQUIPMENT_FIELD_CONFIG.reduce((accumulator, config) => {
            accumulator[config.pluralKey] = new Set();
            return accumulator;
          }, {})
        );

      return referencesByEquipment;
    },
    [assembledTerminals, editingTerminalId, terminaux]
  );

  const buildEquipmentOptions = useCallback(
    (equipmentList, equipmentType, selectedReference) =>
      equipmentList
        .filter((equipment) => {
          const normalizedReference = normalizeText(equipment.reference);
          const isSelectedEquipment = normalizeText(selectedReference) === normalizedReference;
          const isAssigned = assignedEquipmentReferences[equipmentType]?.has(normalizedReference);
          return isSelectedEquipment || (!isAssigned && isEquipmentAvailableStatus(equipment.statut));
        })
        .map((equipment) => ({
          value: equipment.reference,
          label: `${equipment.reference} - ${equipment.marque || 'Marque N/A'} ${equipment.modele || ''}`.trim(),
        })),
    [assignedEquipmentReferences]
  );

  const imprimantesOptions = useMemo(
    () => buildEquipmentOptions(equipments.imprimantes, 'imprimantes', formData.imprimante),
    [buildEquipmentOptions, equipments.imprimantes, formData.imprimante]
  );
  const lecteursOptions = useMemo(
    () => buildEquipmentOptions(equipments.lecteurs, 'lecteurs', formData.lecteur),
    [buildEquipmentOptions, equipments.lecteurs, formData.lecteur]
  );
  const ecransOptions = useMemo(
    () => buildEquipmentOptions(equipments.ecrans, 'ecrans', formData.ecran),
    [buildEquipmentOptions, equipments.ecrans, formData.ecran]
  );
  const afficheurOptions = useMemo(
    () => buildEquipmentOptions(equipments.afficheurs, 'afficheurs', formData.afficheur),
    [buildEquipmentOptions, equipments.afficheurs, formData.afficheur]
  );
  const bucsOptions = useMemo(
    () => buildEquipmentOptions(equipments.bucs || [], 'bucs', formData.buc),
    [buildEquipmentOptions, equipments.bucs, formData.buc]
  );
  const alimentationsOptions = useMemo(
    () => buildEquipmentOptions(equipments.alimentations || [], 'alimentations', formData.alimentation),
    [buildEquipmentOptions, equipments.alimentations, formData.alimentation]
  );
  const boutonsMarcheArretOptions = useMemo(
    () => buildEquipmentOptions(equipments.boutonsMarcheArret || [], 'boutonsMarcheArret', formData.boutonMarcheArret),
    [buildEquipmentOptions, equipments.boutonsMarcheArret, formData.boutonMarcheArret]
  );
  const afficheursTerminalOptions = useMemo(
    () => buildEquipmentOptions(equipments.afficheursTerminal || [], 'afficheursTerminal', formData.afficheurTerminal),
    [buildEquipmentOptions, equipments.afficheursTerminal, formData.afficheurTerminal]
  );
  const circuitsAfficheurClientOptions = useMemo(
    () => buildEquipmentOptions(equipments.circuitsAfficheurClient || [], 'circuitsAfficheurClient', formData.circuitAfficheurClient),
    [buildEquipmentOptions, equipments.circuitsAfficheurClient, formData.circuitAfficheurClient]
  );
  const circuitsBacUcOptions = useMemo(
    () => buildEquipmentOptions(equipments.circuitsBacUc || [], 'circuitsBacUc', formData.circuitBacUc),
    [buildEquipmentOptions, equipments.circuitsBacUc, formData.circuitBacUc]
  );
  const cartesMeresBacUcOptions = useMemo(
    () => buildEquipmentOptions(equipments.cartesMeresBacUc || [], 'cartesMeresBacUc', formData.carteMereBacUc),
    [buildEquipmentOptions, equipments.cartesMeresBacUc, formData.carteMereBacUc]
  );
  const ssdsOptions = useMemo(
    () => buildEquipmentOptions(equipments.ssds || [], 'ssds', formData.ssd),
    [buildEquipmentOptions, equipments.ssds, formData.ssd]
  );

  const findEquipmentConflict = useCallback(
    (formKey, selectedReference) => {
      if (!selectedReference) {
        return null;
      }

      const config = EQUIPMENT_FIELD_CONFIG.find((item) => item.formKey === formKey);
      if (!config) {
        return null;
      }

      return (
        terminaux.find(
          (terminal) =>
            String(terminal.id) !== String(editingTerminalId ?? '') &&
            normalizeText(terminal[config.terminalKey]) === normalizeText(selectedReference)
        ) || null
      );
    },
    [editingTerminalId, terminaux]
  );

  const handleSaveTerminal = async () => {
    if (!canManage) {
      showReadOnlyToast();
      return;
    }

    if (configurationMode === 'assembled' && !selectedAssembledTerminal) {
      toast({
        title: 'Terminal assemblé requis',
        description: 'Sélectionnez un terminal assemblé disponible ou basculez sur le montage manuel.',
        variant: 'destructive',
      });
      return;
    }

    const missingFields = [
      !formRegion ? 'région' : null,
      !agenceId ? 'agence' : null,
      !formData.ref?.trim() ? 'référence' : null,
      !formData.type?.trim() ? 'type' : null,
      !formData.position?.trim() ? 'position' : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      toast({
        title: 'Champs requis',
        description: `Veuillez renseigner : ${missingFields.join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    if (selectedAgencyHasReachedCapacity) {
      toast({
        title: 'Capacité agence atteinte',
        description: `${selectedAgency?.nom || "L'agence sélectionnée"} a déjà ${selectedAgencyTerminalCount} terminal(aux) configuré(s) pour ${normalizedSelectedAgencyTerminalLimit} déclaré(s) dans l’espace Agence.`,
        variant: 'destructive',
      });
      return;
    }

    const duplicatedReferenceTerminal = terminaux.find(
      (terminal) =>
        String(terminal.id) !== String(editingTerminalId ?? '') &&
        normalizeText(terminal.reference) === normalizeText(formData.ref)
    );

    if (duplicatedReferenceTerminal) {
      toast({
        title: 'Référence déjà utilisée',
        description: `La référence ${formData.ref.trim()} est déjà affectée au terminal ${duplicatedReferenceTerminal.reference}.`,
        variant: 'destructive',
      });
      return;
    }

    for (const config of EQUIPMENT_FIELD_CONFIG) {
      const conflictTerminal = findEquipmentConflict(config.formKey, formData[config.formKey]);
      if (conflictTerminal) {
        const conflictAgency = agenciesById[String(conflictTerminal.agence_id)];
        toast({
          title: `${config.label} déjà configuré`,
          description: `${formData[config.formKey]} est déjà affecté au terminal ${conflictTerminal.reference}${conflictAgency?.nom ? ` de ${conflictAgency.nom}` : ''}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    const payload = {
      reference: formData.ref.trim(),
      type_terminal: formData.type.trim(),
      position: formData.position.trim(),
      adresse_ip: formData.ip || null,
      agence_id: agenceId,
      imprimante_reference: formData.imprimante || null,
      lecteur_reference: formData.lecteur || null,
      ecran_reference: formData.ecran || null,
      afficheur_reference: formData.afficheur || null,
      buc_reference: formData.buc || null,
      alimentation_reference: formData.alimentation || null,
      bouton_marche_arret_reference: formData.boutonMarcheArret || null,
      afficheur_terminal_reference: formData.afficheurTerminal || null,
      circuit_afficheur_client_reference: formData.circuitAfficheurClient || null,
      circuit_bac_uc_reference: formData.circuitBacUc || null,
      carte_mere_bac_uc_reference: formData.carteMereBacUc || null,
      ssd_reference: formData.ssd || null,
      statut: editingTerminal?.statut || 'Actif',
    };

    setIsLoading(true);

    const query = editingTerminalId
      ? supabase.from('terminaux').update(payload).eq('id', editingTerminalId).select('id, reference').single()
      : supabase.from('terminaux').insert(payload).select('id, reference').single();

    const { data: savedTerminal, error } = await query;

    if (error) {
      toast({
        title: "Erreur d'enregistrement",
        description: error.message,
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (configurationMode === 'assembled' && selectedAssembledTerminalId) {
      const { data: assignedTerminal, error: assignmentError } = await supabase
        .from('terminaux_assembles')
        .update({
          statut: 'Assigné',
          agence_id: agenceId,
          terminal_id: savedTerminal?.id || editingTerminalId || null,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', selectedAssembledTerminalId)
        .select('id, statut, agence_id, terminal_id')
        .single();

      if (assignmentError || !assignedTerminal) {
        if (!editingTerminalId && savedTerminal?.id) {
          await supabase.from('terminaux').delete().eq('id', savedTerminal.id);
        }
        toast({
          title: "Erreur d'assignation",
          description: assignmentError?.message || 'Le terminal assemblé n’a pas pu être marqué comme assigné.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
    }

    // Mise à jour automatique des statuts sous-ensembles
    const statusOps = [];
    for (const config of EQUIPMENT_FIELD_CONFIG) {
      const newRef = formData[config.formKey] || null;
      const oldRef = editingTerminalId ? (editingTerminal?.[config.terminalKey] || null) : null;
      if (newRef && newRef !== oldRef) {
        statusOps.push(supabase.from(config.table).update({ statut: 'En service' }).eq('reference', newRef));
      }
      if (oldRef && oldRef !== newRef) {
        statusOps.push(supabase.from(config.table).update({ statut: 'Disponible' }).eq('reference', oldRef));
      }
    }

    if (statusOps.length > 0) {
      const statusResults = await Promise.all(statusOps);
      const statusError = statusResults.find((result) => result.error)?.error;
      if (statusError) {
        toast({
          title: 'Terminal assigné avec avertissement',
          description: `Le terminal est assigné, mais un statut de sous-ensemble n’a pas été actualisé : ${statusError.message}`,
          variant: 'destructive',
        });
      }
    }

    toast({
      title: editingTerminalId ? 'Terminal mis à jour' : 'Terminal ajouté',
      description: editingTerminalId
        ? 'La configuration du terminal a été mise à jour.'
        : 'Le terminal a été configuré avec succès.',
      className: 'bg-green-500 text-white',
    });

    resetForm();
    await loadData();
    setIsLoading(false);
  };

  const handleEditTerminal = (terminal) => {
    if (!canManage) {
      showReadOnlyToast();
      return;
    }

    const agency = agenciesById[String(terminal.agence_id)];

    setEditingTerminalId(terminal.id);
    setConfigurationMode('manual');
    setSelectedAssembledTerminalId('');
    setAgenceId(String(terminal.agence_id));
    setFormRegion(agency?.region || '');
    setFormSecteur(agency?.secteur || '');
    setFormData({
      ref: terminal.reference || '',
      type: terminal.type_terminal || '2020',
      position: terminal.position || '',
      ip: terminal.adresse_ip || '',
      imprimante: terminal.imprimante_reference || '',
      lecteur: terminal.lecteur_reference || '',
      ecran: terminal.ecran_reference || '',
      afficheur: terminal.afficheur_reference || '',
      buc: terminal.buc_reference || '',
      alimentation: terminal.alimentation_reference || '',
      boutonMarcheArret: terminal.bouton_marche_arret_reference || '',
      afficheurTerminal: terminal.afficheur_terminal_reference || '',
      circuitAfficheurClient: terminal.circuit_afficheur_client_reference || '',
      circuitBacUc: terminal.circuit_bac_uc_reference || '',
      carteMereBacUc: terminal.carte_mere_bac_uc_reference || '',
      ssd: terminal.ssd_reference || '',
    });

    setIsEditDialogOpen(true);
  };

  const handleDeleteTerminal = async (terminal) => {
    if (!canManage) {
      showReadOnlyToast();
      return;
    }

    if (!window.confirm(`Supprimer le terminal ${terminal.reference} ? Cette action retirera aussi sa configuration actuelle.`)) {
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.from('terminaux').delete().eq('id', terminal.id);

    if (error) {
      toast({
        title: 'Erreur de suppression',
        description: error.message,
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    await supabase
      .from('terminaux_assembles')
      .update({ statut: 'Disponible', agence_id: null, terminal_id: null, assigned_at: null })
      .eq('terminal_id', terminal.id);

    toast({
      title: 'Terminal supprimé',
      description: `Le terminal ${terminal.reference} a été supprimé du parc.`,
      className: 'bg-red-500 text-white',
    });

    if (String(editingTerminalId) === String(terminal.id)) {
      resetForm();
    }

    await loadData();
    setIsLoading(false);
  };

  const downloadAssembledTerminalTemplate = () => {
    downloadCsvFile('modele_terminaux_assembles.csv', [ASSEMBLED_TERMINAL_HEADERS]);
  };

  const exportAssembledTerminals = () => {
    const headers = [...ASSEMBLED_TERMINAL_HEADERS, 'statut', 'agence_id', 'terminal_id'];
    const rows = assembledTerminals.map((terminal) =>
      [
        ...ASSEMBLED_TERMINAL_FIELD_CONFIG.map((field) => terminal[field.dbKey] ?? ''),
        terminal.statut ?? '',
        terminal.agence_id ?? '',
        terminal.terminal_id ?? '',
      ]
    );
    downloadCsvFile('stock_terminaux_assembles.csv', [headers, ...rows]);
  };

  const handleAssembledTerminalImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!canManage) {
      showReadOnlyToast();
      event.target.value = '';
      return;
    }

    try {
      setIsLoading(true);
      const spreadsheetRows = await readSpreadsheetRows(file);
      if (spreadsheetRows.length < 2) {
        throw new Error('Le fichier doit contenir une ligne d’en-têtes et au moins un terminal.');
      }

      const [headerRow, ...dataRows] = spreadsheetRows;
      const normalizedHeaders = headerRow.map(normalizeCsvHeader);
      const missingHeaders = ASSEMBLED_TERMINAL_FIELD_CONFIG
        .filter((field) => findCsvFieldIndex(normalizedHeaders, field) < 0)
        .map((field) => field.header);
      if (missingHeaders.length > 0) {
        throw new Error(`En-tête(s) manquant(s) : ${missingHeaders.join(', ')}.`);
      }

      const rows = dataRows
        .map((values) => {
          return ASSEMBLED_TERMINAL_FIELD_CONFIG.reduce((accumulator, field) => {
            accumulator[field.dbKey] = getCsvFieldValue(values, normalizedHeaders, field);
            return accumulator;
          }, {
            type_terminal: getCsvFieldValue(values, normalizedHeaders, {
              header: 'TYPE TERMINAL',
              aliases: ['type_terminal', 'type terminal', 'type'],
            }),
            statut: getCsvFieldValue(values, normalizedHeaders, {
              header: 'STATUT',
              aliases: ['statut'],
            }),
          });
        })
        .filter((row) => row.reference);

      if (rows.length === 0) {
        throw new Error('Aucun terminal assemblé exploitable dans le fichier.');
      }

      const payloadByReference = new Map(rows.map((row) => [normalizeText(row.reference), {
        reference: row.reference,
        type_terminal: row.type_terminal || '2020',
        mac_address: row.mac_address || null,
        identifiant: row.identifiant || null,
        numero_secu: row.numero_secu || null,
        commentaire: row.commentaire || null,
        statut: normalizeText(row.statut) === 'assigne' ? 'Assigné' : 'Disponible',
        ...EQUIPMENT_FIELD_CONFIG.reduce((accumulator, config) => {
          accumulator[config.terminalKey] = row[config.terminalKey] || null;
          return accumulator;
        }, {}),
      }]));
      const payload = [...payloadByReference.values()];

      const equipmentStockResults = await Promise.all(
        ASSEMBLED_EQUIPMENT_FIELD_CONFIG.map(async (field) => {
          const equipmentConfig = EQUIPMENT_FIELD_CONFIG.find((config) => config.terminalKey === field.dbKey);
          const references = [...new Set(payload.map((terminal) => terminal[field.dbKey]).filter(Boolean))];
          if (!equipmentConfig || references.length === 0) return { error: null };

          return supabase.from(equipmentConfig.table).upsert(
            references.map((reference) => ({
              reference,
              modele: 'Terminal assemblé',
              marque: 'Non renseignée',
              statut: 'En service',
              description: 'Sous-ensemble importé avec un terminal assemblé',
            })),
            { onConflict: 'reference', ignoreDuplicates: true }
          );
        })
      );
      const equipmentStockError = equipmentStockResults.find((result) => result.error)?.error;
      if (equipmentStockError) {
        throw new Error(`Synchronisation du stock des sous-ensembles impossible : ${equipmentStockError.message}`);
      }

      const { error } = await supabase
        .from('terminaux_assembles')
        .upsert(payload, { onConflict: 'reference' });

      if (error) {
        throw error;
      }

      toast({
        title: 'Terminaux assemblés importés',
        description: `${payload.length} terminal(aux) ajouté(s) ou mis à jour avec les ${ASSEMBLED_TERMINAL_FIELD_CONFIG.length} champs du modèle.`,
        className: 'bg-green-500 text-white',
      });

      await loadData();
    } catch (error) {
      toast({
        title: 'Erreur import terminaux assemblés',
        description: error.message || 'Impossible de lire le fichier CSV.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const handleReleaseAssembledTerminal = async (terminal) => {
    if (!canManage) {
      showReadOnlyToast();
      return;
    }

    const { error } = await supabase
      .from('terminaux_assembles')
      .update({ statut: 'Disponible', agence_id: null, terminal_id: null, assigned_at: null })
      .eq('id', terminal.id);

    if (error) {
      toast({
        title: 'Erreur de libération',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    await loadData();
  };

  const handleDeleteAssembledTerminal = async (terminal) => {
    if (!canManage) {
      showReadOnlyToast();
      return;
    }

    if (normalizeText(terminal.statut) === 'assigne') {
      toast({
        title: 'Terminal assemblé assigné',
        description: 'Libérez le terminal assemblé avant de le supprimer du stock.',
        variant: 'destructive',
      });
      return;
    }

    if (!window.confirm(`Supprimer le terminal assemblé ${terminal.reference} du stock ?`)) {
      return;
    }

    const { error } = await supabase.from('terminaux_assembles').delete().eq('id', terminal.id);
    if (error) {
      toast({
        title: 'Erreur de suppression',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    await loadData();
  };

  const filteredAgencesForPark = useMemo(
    () =>
      agences.filter(
        (agence) =>
          parkFilters.region.length === 0 ||
          parkFilters.region.some((r) => normalizeRegionText(r) === normalizeRegionText(agence.region))
      ),
    [agences, parkFilters.region]
  );

  const parkAgencyOptions = useMemo(
    () => [
      { value: ALL_FILTER_VALUE, label: 'Agences' },
      ...filteredAgencesForPark.map((agence) => ({
        value: String(agence.id),
        label: `${agence.nom}${agence.codePDV ? ` • ${agence.codePDV}` : ''}`,
      })),
    ],
    [filteredAgencesForPark]
  );

  const parkTerminalRows = useMemo(
    () =>
      terminaux.map((terminal) => {
        const agency = agenciesById[String(terminal.agence_id)];
        return {
          ...terminal,
          agenceNom: agency?.nom || 'Agence inconnue',
          agenceCode: agency?.codePDV || '',
          regionNom: agency?.region || '',
          secteurNom: agency?.secteur || '',
        };
      }),
    [agenciesById, terminaux]
  );

  const parkSecteurOptions = useMemo(
    () => Array.from(new Set(parkTerminalRows.map((t) => t.secteurNom).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [parkTerminalRows]
  );

  const filteredParkTerminalRows = useMemo(() => {
    const normalizedSearch = normalizeText(parkFilters.search);

    return parkTerminalRows
      .filter(
        (terminal) =>
          parkFilters.region.length === 0 ||
          parkFilters.region.some((r) => normalizeRegionText(r) === normalizeRegionText(terminal.regionNom))
      )
      .filter(
        (terminal) =>
          parkFilters.secteur.length === 0 ||
          parkFilters.secteur.some((s) => normalizeRegionText(s) === normalizeRegionText(terminal.secteurNom))
      )
      .filter(
        (terminal) =>
          parkFilters.agenceId.length === 0 ||
          parkFilters.agenceId.includes(String(terminal.agence_id))
      )
      .filter(
        (terminal) => parkFilters.type.length === 0 || parkFilters.type.includes(terminal.type_terminal)
      )
      .filter(
        (terminal) => parkFilters.statut.length === 0 || parkFilters.statut.includes(terminal.statut)
      )
      .filter(
        (terminal) =>
          !normalizedSearch ||
          [
            terminal.regionNom,
            terminal.agenceNom,
            terminal.agenceCode,
            terminal.reference,
            terminal.type_terminal,
            terminal.position,
            terminal.adresse_ip,
            terminal.imprimante_reference,
            terminal.lecteur_reference,
            terminal.ecran_reference,
            terminal.afficheur_reference,
            terminal.buc_reference,
            terminal.alimentation_reference,
            terminal.bouton_marche_arret_reference,
            terminal.afficheur_terminal_reference,
            terminal.circuit_afficheur_client_reference,
            terminal.circuit_bac_uc_reference,
            terminal.carte_mere_bac_uc_reference,
            terminal.ssd_reference,
            terminal.statut,
          ].some((value) => normalizeText(value).includes(normalizedSearch))
      );
  }, [parkFilters, parkTerminalRows]);

  const configurationContent = (
    <div className={showEquipmentManagement ? 'space-y-6' : 'space-y-4'}>
      <Card className="relative overflow-hidden shadow-lg">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
        <CardHeader className="relative">
          <CardTitle>Configuration des terminaux</CardTitle>
          <CardDescription>
            {resolvedLockedAgence
              ? `Configurez les terminaux de ${resolvedLockedAgence.nom} en choisissant leurs sous-ensembles disponibles.`
              : 'Choisissez une région, puis une agence, afin de configurer ses terminaux.'}
          </CardDescription>
        </CardHeader>
        <CardContent className={showEquipmentManagement ? 'space-y-5' : 'space-y-4'}>
          {readOnlyMessage ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {readOnlyMessage}
            </div>
          ) : null}

          <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-slate-600">
            Un sous-ensemble déjà configuré sur un terminal ne peut pas être réaffecté à un autre tant qu’il n’a pas été libéré.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {!resolvedLockedAgence && (
              <div className="space-y-2">
                <Label>Région</Label>
                <Combobox
                  options={regionOptions}
                  value={formRegion}
                  onSelect={(value) => {
                    setFormRegion(value);
                    setFormSecteur('');
                    setAgenceId('');
                  }}
                  placeholder="Région"
                  searchPlaceholder="Rechercher une région..."
                  emptyText="Aucune région trouvée."
                  disabled={isLoading}
                />
              </div>
            )}
            {!resolvedLockedAgence && (
              <div className="space-y-2">
                <Label>Secteur</Label>
                <Combobox
                  options={secteurOptionsForForm}
                  value={formSecteur}
                  onSelect={(value) => {
                    setFormSecteur(value);
                    setAgenceId('');
                  }}
                  placeholder={formRegion ? 'Secteur' : 'Secteur (région d’abord)'}
                  searchPlaceholder="Rechercher un secteur..."
                  emptyText="Aucun secteur pour cette région."
                  disabled={isLoading || !formRegion}
                />
              </div>
            )}
            {!resolvedLockedAgence && (
              <div className="space-y-2">
                <Label>Agence</Label>
                <Combobox
                  options={agencesOptions}
                  value={agenceId}
                  onSelect={(value) => {
                    setAgenceId(value);
                    setFormData((previousState) => ({ ...previousState, position: '' }));
                    const nextAgency = agenciesById[String(value)];
                    if (nextAgency?.region) {
                      setFormRegion(nextAgency.region);
                    }
                    if (nextAgency?.secteur) {
                      setFormSecteur(nextAgency.secteur);
                    }
                  }}
                  placeholder="Agence"
                  searchPlaceholder="Rechercher une agence..."
                  emptyText="Aucune agence trouvée."
                  disabled={isLoading || !formRegion}
                />
              </div>
            )}

            <div className="space-y-3 rounded-xl border border-primary/15 bg-white/80 p-3 md:col-span-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                  <Label>Mode de configuration</Label>
                  <p className="text-xs text-slate-500">
                    Assignez un terminal déjà assemblé ou composez manuellement ses sous-ensembles.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
                  <Button
                    type="button"
                    variant={configurationMode === 'assembled' ? 'default' : 'outline'}
                    onClick={() => setConfigurationMode('assembled')}
                    disabled={isLoading || Boolean(editingTerminalId)}
                    className="gap-2"
                  >
                    <PackageCheck className="h-4 w-4" />
                    Assigner un terminal assemblé
                  </Button>
                  <Button
                    type="button"
                    variant={configurationMode === 'manual' ? 'default' : 'outline'}
                    onClick={() => {
                      setConfigurationMode('manual');
                      setSelectedAssembledTerminalId('');
                    }}
                    disabled={isLoading || Boolean(editingTerminalId)}
                    className="gap-2"
                  >
                    Assembler un terminal
                  </Button>
                </div>
              </div>

              {configurationMode === 'assembled' ? (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="space-y-2">
                    <Label>Terminal assemblé disponible</Label>
                    <Combobox
                      options={availableAssembledTerminalOptions}
                      value={selectedAssembledTerminalId}
                      onSelect={setSelectedAssembledTerminalId}
                      placeholder="Choisir un terminal assemblé"
                      searchPlaceholder="Référence, type, IP..."
                      emptyText="Aucun terminal assemblé disponible."
                      disabled={isLoading || Boolean(editingTerminalId)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadAssembledTerminalTemplate}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Modèle CSV
                  </Button>
                </div>
              ) : null}

              {configurationMode === 'assembled' && selectedAssembledTerminal ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-slate-600">
                  Le terminal {selectedAssembledTerminal.reference} préremplit l’ID_TRM et les sous-ensembles.
                  La prochaine position libre est proposée automatiquement. L’adresse IP peut être renseignée si elle est connue.
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Type de terminal</Label>
              <Combobox
                options={[
                  { value: '2020', label: '2020' },
                  { value: '2031', label: '2031' },
                ]}
                value={formData.type}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, type: value }))}
                placeholder="Type"
                searchPlaceholder="Rechercher un type..."
                emptyText="Aucun type trouvé."
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Référence</Label>
              <Input
                value={formData.ref}
                onChange={(event) => setFormData((previousState) => ({ ...previousState, ref: event.target.value }))}
                placeholder="Ex: TERM-001"
                disabled={isLoading || configurationMode === 'assembled'}
              />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input
                value={formData.position}
                onChange={(event) =>
                  setFormData((previousState) => ({ ...previousState, position: event.target.value }))
                }
                placeholder="Ex: Guichet 1"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Adresse IP <span className="font-normal text-muted-foreground">(facultative)</span></Label>
              <Input
                value={formData.ip}
                onChange={(event) => setFormData((previousState) => ({ ...previousState, ip: event.target.value }))}
                placeholder="Ex : 192.168.1.10"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label>Imprimante</Label>
              <Combobox
                options={imprimantesOptions}
                value={formData.imprimante}
                onSelect={(value) =>
                  setFormData((previousState) => ({ ...previousState, imprimante: value }))
                }
                placeholder="Imprimante"
                searchPlaceholder="Rechercher une imprimante..."
                emptyText="Aucune imprimante disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Lecteur</Label>
              <Combobox
                options={lecteursOptions}
                value={formData.lecteur}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, lecteur: value }))}
                placeholder="Lecteur"
                searchPlaceholder="Rechercher un lecteur..."
                emptyText="Aucun lecteur disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Écran</Label>
              <Combobox
                options={ecransOptions}
                value={formData.ecran}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, ecran: value }))}
                placeholder="Écran"
                searchPlaceholder="Rechercher un écran..."
                emptyText="Aucun écran disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Afficheur client</Label>
              <Combobox
                options={afficheurOptions}
                value={formData.afficheur}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, afficheur: value }))}
                placeholder="Afficheur client"
                searchPlaceholder="Rechercher un afficheur..."
                emptyText="Aucun afficheur disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>BUC</Label>
              <Combobox
                options={bucsOptions}
                value={formData.buc}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, buc: value }))}
                placeholder="BUC"
                searchPlaceholder="Rechercher un BUC..."
                emptyText="Aucun BUC disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Alimentation</Label>
              <Combobox
                options={alimentationsOptions}
                value={formData.alimentation}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, alimentation: value }))}
                placeholder="Alimentation"
                searchPlaceholder="Rechercher une alimentation..."
                emptyText="Aucune alimentation disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Bouton marche/arrêt</Label>
              <Combobox
                options={boutonsMarcheArretOptions}
                value={formData.boutonMarcheArret}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, boutonMarcheArret: value }))}
                placeholder="Bouton marche/arrêt"
                searchPlaceholder="Rechercher un bouton..."
                emptyText="Aucun bouton disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Afficheur</Label>
              <Combobox
                options={afficheursTerminalOptions}
                value={formData.afficheurTerminal}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, afficheurTerminal: value }))}
                placeholder="Afficheur"
                searchPlaceholder="Rechercher un afficheur..."
                emptyText="Aucun afficheur disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Circuit afficheur client</Label>
              <Combobox
                options={circuitsAfficheurClientOptions}
                value={formData.circuitAfficheurClient}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, circuitAfficheurClient: value }))}
                placeholder="Circuit afficheur client"
                searchPlaceholder="Rechercher un circuit..."
                emptyText="Aucun circuit disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Circuit BAC UC</Label>
              <Combobox
                options={circuitsBacUcOptions}
                value={formData.circuitBacUc}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, circuitBacUc: value }))}
                placeholder="Circuit BAC UC"
                searchPlaceholder="Rechercher un circuit..."
                emptyText="Aucun circuit disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Carte mère BAC UC</Label>
              <Combobox
                options={cartesMeresBacUcOptions}
                value={formData.carteMereBacUc}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, carteMereBacUc: value }))}
                placeholder="Carte mère BAC UC"
                searchPlaceholder="Rechercher une carte mère..."
                emptyText="Aucune carte mère disponible."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>SSD</Label>
              <Combobox
                options={ssdsOptions}
                value={formData.ssd}
                onSelect={(value) => setFormData((previousState) => ({ ...previousState, ssd: value }))}
                placeholder="SSD"
                searchPlaceholder="Rechercher un SSD..."
                emptyText="Aucun SSD disponible."
                disabled={isLoading}
              />
            </div>
          </div>

          {selectedAgency ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <MapPinned className="h-4 w-4 text-primary" />
                  {selectedAgency.nom}
                </span>
                <span>Région : {selectedAgency.region || 'N/A'}</span>
                <span>Code PDV : {selectedAgency.codePDV || 'N/A'}</span>
                <span>
                  Terminaux configurés : {selectedAgencyTerminalCount}
                  {hasSelectedAgencyTerminalLimit ? ` / ${normalizedSelectedAgencyTerminalLimit}` : ''}
                </span>
              </div>

              {hasSelectedAgencyTerminalLimit ? (
                <div
                  className={`rounded-md px-3 py-2 text-xs ${
                    selectedAgencyHasReachedCapacity
                      ? 'border border-red-200 bg-red-50 text-red-700'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {selectedAgencyHasReachedCapacity
                    ? "Le nombre maximum de terminaux déclaré pour cette agence est atteint. Vous pouvez modifier un terminal existant, mais pas en ajouter un nouveau."
                    : `Capacité disponible : ${Math.max(
                        normalizedSelectedAgencyTerminalLimit - selectedAgencyTerminalCount,
                        0
                      )} terminal(aux) restant(s).`}
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Le nombre de terminaux autorisé pour cette agence n’est pas encore défini dans l’espace Agence.
                </div>
              )}
            </div>
          ) : null}

          <Separator />

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSaveTerminal}
              disabled={
                isLoading ||
                !canManage ||
                Boolean(editingTerminalId)
              }
              className="bg-primary hover:bg-primary/90"
            >
              Sauvegarder le terminal
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={isLoading}>
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden shadow-lg">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-primary/80 to-primary/35" />
        <CardHeader className="relative space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-primary" />
                Stock de terminaux assemblés
              </CardTitle>
              <CardDescription>
                Importez les terminaux déjà montés et suivez leur disponibilité avant affectation en agence.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={assembledImportInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={handleAssembledTerminalImport}
              />
              <Button
                type="button"
                variant="outline"
                onClick={downloadAssembledTerminalTemplate}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Modèle
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => assembledImportInputRef.current?.click()}
                disabled={!canManage || isLoading}
                className="gap-2"
              >
                <FileUp className="h-4 w-4" />
                Importer
              </Button>
              <Button type="button" variant="outline" onClick={exportAssembledTerminals} className="gap-2">
                <Download className="h-4 w-4" />
                Exporter
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-blue-100 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Total</p>
              <p className="text-2xl font-bold text-slate-900">{assembledTerminals.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Disponibles</p>
              <p className="text-2xl font-bold text-emerald-700">
                {assembledTerminals.filter((terminal) => normalizeText(terminal.statut) !== 'assigne').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Assignés</p>
              <p className="text-2xl font-bold text-primary">
                {assembledTerminals.filter((terminal) => normalizeText(terminal.statut) === 'assigne').length}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table containerClassName="rounded-xl shadow-none">
            <TableHeader>
              <TableRow>
                <TableHead>ID_TRM</TableHead>
                <TableHead>MAC adress</TableHead>
                <TableHead>Identifiant</TableHead>
                <TableHead>N° secu</TableHead>
                <TableHead>Sous-ensembles</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assembledTerminals.slice(0, 8).map((terminal) => {
                const assignedAgency = agenciesById[String(terminal.agence_id)];
                const filledPartsCount = ASSEMBLED_EQUIPMENT_FIELD_CONFIG.filter((field) => terminal[field.dbKey]).length;
                const isAssigned = normalizeText(terminal.statut) === 'assigne';
                const isExpanded = String(expandedAssembledTerminalId) === String(terminal.id);
                return (
                  <React.Fragment key={terminal.id}>
                    <TableRow>
                      <TableCell className="font-semibold">{terminal.reference}</TableCell>
                      <TableCell>{terminal.mac_address || 'N/A'}</TableCell>
                      <TableCell>{terminal.identifiant || 'N/A'}</TableCell>
                      <TableCell>{terminal.numero_secu || 'N/A'}</TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">
                          {filledPartsCount}/{ASSEMBLED_EQUIPMENT_FIELD_CONFIG.length} référencé(s)
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={isAssigned ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                          {isAssigned ? `Assigné${assignedAgency?.nom ? ` à ${assignedAgency.nom}` : ''}` : 'Disponible'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setExpandedAssembledTerminalId(isExpanded ? null : terminal.id)}
                            title={isExpanded ? 'Masquer les sous-ensembles' : 'Afficher tous les sous-ensembles'}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          {isAssigned ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleReleaseAssembledTerminal(terminal)}
                              disabled={!canManage}
                            >
                              Libérer
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteAssembledTerminal(terminal)}
                            disabled={!canManage || isAssigned}
                            title="Supprimer du stock"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded ? (
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                        <TableCell colSpan={7} className="px-5 py-4">
                          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {ASSEMBLED_EQUIPMENT_FIELD_CONFIG.map((field) => (
                              <div key={field.dbKey} className="min-w-0">
                                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                  {field.header}
                                </p>
                                <p className="truncate text-sm font-medium text-slate-900" title={terminal[field.dbKey] || 'Non renseigné'}>
                                  {terminal[field.dbKey] || 'Non renseigné'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {assembledTerminals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Aucun terminal assemblé importé pour le moment.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            {assembledTerminals.length > 8 ? (
              <TableCaption>{assembledTerminals.length - 8} terminal(aux) supplémentaire(s) disponible(s) dans l’export.</TableCaption>
            ) : null}
          </Table>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden shadow-lg">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
        <CardHeader className={showEquipmentManagement ? 'relative space-y-4' : 'relative space-y-3'}>
          <div className="flex flex-col gap-2">
            <CardTitle>Parc de Terminaux</CardTitle>
            <CardDescription>
              Consultez les terminaux configurés, filtrez-les par région ou agence, puis modifiez ou supprimez leurs affectations.
            </CardDescription>
          </div>

          <div className={resolvedLockedAgence ? 'grid gap-4 md:grid-cols-3' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-6'}>
            {!resolvedLockedAgence && (
              <div className="space-y-2">
                <Label>Région</Label>
                <Combobox
                  multi
                  options={parkRegionOptions}
                  value={parkFilters.region}
                  onSelect={(arr) =>
                    setParkFilters((previousState) => ({
                      ...previousState,
                      region: arr,
                      secteur: [],
                      agenceId: [],
                    }))
                  }
                  searchPlaceholder="Rechercher une région..."
                  emptyText="Aucune région trouvée."
                  disabled={isLoading}
                />
              </div>
            )}
            {!resolvedLockedAgence && (
              <div className="space-y-2">
                <Label>Secteur</Label>
                <Combobox
                  multi
                  options={[{ value: ALL_FILTER_VALUE, label: 'Secteurs' }, ...parkSecteurOptions.map((s) => ({ value: s, label: s }))]}
                  value={parkFilters.secteur}
                  onSelect={(arr) =>
                    setParkFilters((previousState) => ({
                      ...previousState,
                      secteur: arr,
                      agenceId: [],
                    }))
                  }
                  searchPlaceholder="Rechercher un secteur..."
                  emptyText="Aucun secteur trouvé."
                  disabled={isLoading}
                />
              </div>
            )}
            {!resolvedLockedAgence && (
              <div className="space-y-2">
                <Label>Agence</Label>
                <Combobox
                  multi
                  options={parkAgencyOptions}
                  value={parkFilters.agenceId}
                  onSelect={(arr) =>
                    setParkFilters((previousState) => ({
                      ...previousState,
                      agenceId: arr,
                    }))
                  }
                  searchPlaceholder="Rechercher une agence..."
                  emptyText="Aucune agence trouvée."
                  disabled={isLoading}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Type</Label>
              <Combobox
                multi
                options={[
                  { value: ALL_FILTER_VALUE, label: 'Types' },
                  { value: '2020', label: '2020' },
                  { value: '2031', label: '2031' },
                ]}
                value={parkFilters.type}
                onSelect={(arr) =>
                  setParkFilters((previousState) => ({
                    ...previousState,
                    type: arr,
                  }))
                }
                searchPlaceholder="Rechercher un type..."
                emptyText="Aucun type trouvé."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Combobox
                multi
                options={[
                  { value: ALL_FILTER_VALUE, label: 'Statuts' },
                  { value: 'Actif', label: 'Actif' },
                  { value: 'Inactif', label: 'Inactif' },
                  { value: 'En maintenance', label: 'En maintenance' },
                  { value: 'Hors service', label: 'Hors service' },
                ]}
                value={parkFilters.statut}
                onSelect={(arr) =>
                  setParkFilters((previousState) => ({
                    ...previousState,
                    statut: arr,
                  }))
                }
                searchPlaceholder="Rechercher un statut..."
                emptyText="Aucun statut trouvé."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Recherche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={parkFilters.search}
                  onChange={(event) =>
                    setParkFilters((previousState) => ({ ...previousState, search: event.target.value }))
                  }
                  placeholder="Référence, agence, IP..."
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableCaption>
                {filteredParkTerminalRows.length === 0
                  ? 'Aucun terminal ne correspond aux filtres actuels.'
                  : `${filteredParkTerminalRows.length} terminal(aux) configuré(s).`}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Région</TableHead>
                  <TableHead>Agence</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Adresse IP</TableHead>
                  <TableHead>Imprimante</TableHead>
                  <TableHead>Lecteur</TableHead>
                  <TableHead>Écran</TableHead>
                  <TableHead>Afficheur client</TableHead>
                  <TableHead>BUC</TableHead>
                  <TableHead>Alimentation</TableHead>
                  <TableHead>Bouton marche/arrêt</TableHead>
                  <TableHead>Afficheur</TableHead>
                  <TableHead>Circuit afficheur client</TableHead>
                  <TableHead>Circuit BAC UC</TableHead>
                  <TableHead>Carte mère BAC UC</TableHead>
                  <TableHead>SSD</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParkTerminalRows.map((terminal) => (
                  <TableRow key={terminal.id}>
                    <TableCell>{terminal.regionNom || 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{terminal.agenceNom}</span>
                        <span className="text-xs text-muted-foreground">{terminal.agenceCode || 'Sans code PDV'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{terminal.reference}</TableCell>
                    <TableCell>{terminal.type_terminal || 'N/A'}</TableCell>
                    <TableCell>{terminal.position || 'N/A'}</TableCell>
                    <TableCell>{terminal.adresse_ip || 'N/A'}</TableCell>
                    <TableCell>{terminal.imprimante_reference || 'Non affectée'}</TableCell>
                    <TableCell>{terminal.lecteur_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.ecran_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.afficheur_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.buc_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.alimentation_reference || 'Non affectée'}</TableCell>
                    <TableCell>{terminal.bouton_marche_arret_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.afficheur_terminal_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.circuit_afficheur_client_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.circuit_bac_uc_reference || 'Non affecté'}</TableCell>
                    <TableCell>{terminal.carte_mere_bac_uc_reference || 'Non affectée'}</TableCell>
                    <TableCell>{terminal.ssd_reference || 'Non affecté'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getTerminalStatusBadgeClass(terminal.statut)}>
                        {terminal.statut || 'N/A'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditTerminal(terminal)}
                          className="h-7 w-7 text-blue-500 hover:text-blue-700"
                          disabled={isLoading || !canManage}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTerminal(terminal)}
                          className="h-7 w-7 text-red-500 hover:text-red-700"
                          disabled={isLoading || !canManage}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const editDialog = (
    <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
      <DialogContent className="sm:max-w-3xl relative overflow-hidden p-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/80 to-primary/35" />
        <div className="relative max-h-[90vh] overflow-y-auto px-6 pb-6 pt-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl text-primary">
            Modifier le terminal — {editingTerminal?.reference}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-slate-600">
            Un sous-ensemble déjà configuré sur un terminal ne peut pas être réaffecté à un autre tant qu'il n'a pas été libéré.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Région</Label>
              <Combobox
                options={regionOptions}
                value={formRegion}
                onSelect={(value) => { if (resolvedLockedAgence) return; setFormRegion(value); setAgenceId(''); }}
                placeholder="Région"
                searchPlaceholder="Rechercher une région..."
                emptyText="Aucune région trouvée."
                disabled={isLoading || Boolean(resolvedLockedAgence)}
              />
            </div>
            <div className="space-y-2">
              <Label>Agence</Label>
              <Combobox
                options={agencesOptions}
                value={agenceId}
                onSelect={(value) => { setAgenceId(value); const a = agenciesById[String(value)]; if (a?.region) setFormRegion(a.region); }}
                placeholder="Agence"
                searchPlaceholder="Rechercher une agence..."
                emptyText="Aucune agence trouvée."
                disabled={isLoading || Boolean(resolvedLockedAgence)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type de terminal</Label>
              <Combobox
                options={[{ value: '2020', label: '2020' }, { value: '2031', label: '2031' }]}
                value={formData.type}
                onSelect={(value) => setFormData((s) => ({ ...s, type: value }))}
                placeholder="Type"
                searchPlaceholder="Rechercher un type..."
                emptyText="Aucun type trouvé."
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Référence</Label>
              <Input value={formData.ref} onChange={(e) => setFormData((s) => ({ ...s, ref: e.target.value }))} placeholder="Ex: TERM-001" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Position</Label>
              <Input value={formData.position} onChange={(e) => setFormData((s) => ({ ...s, position: e.target.value }))} placeholder="Ex: Guichet 1" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Adresse IP <span className="font-normal text-muted-foreground">(facultative)</span></Label>
              <Input
                value={formData.ip}
                onChange={(event) => setFormData((s) => ({ ...s, ip: event.target.value }))}
                placeholder="Ex : 192.168.1.10"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label>Imprimante</Label>
              <Combobox options={imprimantesOptions} value={formData.imprimante} onSelect={(v) => setFormData((s) => ({ ...s, imprimante: v }))} placeholder="Imprimante" searchPlaceholder="Rechercher..." emptyText="Aucune disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Lecteur</Label>
              <Combobox options={lecteursOptions} value={formData.lecteur} onSelect={(v) => setFormData((s) => ({ ...s, lecteur: v }))} placeholder="Lecteur" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Écran</Label>
              <Combobox options={ecransOptions} value={formData.ecran} onSelect={(v) => setFormData((s) => ({ ...s, ecran: v }))} placeholder="Écran" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Afficheur client</Label>
              <Combobox options={afficheurOptions} value={formData.afficheur} onSelect={(v) => setFormData((s) => ({ ...s, afficheur: v }))} placeholder="Afficheur" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>BUC</Label>
              <Combobox options={bucsOptions} value={formData.buc} onSelect={(v) => setFormData((s) => ({ ...s, buc: v }))} placeholder="BUC" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Alimentation</Label>
              <Combobox options={alimentationsOptions} value={formData.alimentation} onSelect={(v) => setFormData((s) => ({ ...s, alimentation: v }))} placeholder="Alimentation" searchPlaceholder="Rechercher..." emptyText="Aucune disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Bouton marche/arrêt</Label>
              <Combobox options={boutonsMarcheArretOptions} value={formData.boutonMarcheArret} onSelect={(v) => setFormData((s) => ({ ...s, boutonMarcheArret: v }))} placeholder="Bouton marche/arrêt" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Afficheur</Label>
              <Combobox options={afficheursTerminalOptions} value={formData.afficheurTerminal} onSelect={(v) => setFormData((s) => ({ ...s, afficheurTerminal: v }))} placeholder="Afficheur" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Circuit afficheur client</Label>
              <Combobox options={circuitsAfficheurClientOptions} value={formData.circuitAfficheurClient} onSelect={(v) => setFormData((s) => ({ ...s, circuitAfficheurClient: v }))} placeholder="Circuit afficheur client" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Circuit BAC UC</Label>
              <Combobox options={circuitsBacUcOptions} value={formData.circuitBacUc} onSelect={(v) => setFormData((s) => ({ ...s, circuitBacUc: v }))} placeholder="Circuit BAC UC" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>Carte mère BAC UC</Label>
              <Combobox options={cartesMeresBacUcOptions} value={formData.carteMereBacUc} onSelect={(v) => setFormData((s) => ({ ...s, carteMereBacUc: v }))} placeholder="Carte mère BAC UC" searchPlaceholder="Rechercher..." emptyText="Aucune disponible." disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label>SSD</Label>
              <Combobox options={ssdsOptions} value={formData.ssd} onSelect={(v) => setFormData((s) => ({ ...s, ssd: v }))} placeholder="SSD" searchPlaceholder="Rechercher..." emptyText="Aucun disponible." disabled={isLoading} />
            </div>
          </div>

          {selectedAgency && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                  <MapPinned className="h-4 w-4 text-primary" />{selectedAgency.nom}
                </span>
                <span>Région : {selectedAgency.region || 'N/A'}</span>
                <span>Code PDV : {selectedAgency.codePDV || 'N/A'}</span>
                <span>Terminaux : {selectedAgencyTerminalCount}{hasSelectedAgencyTerminalLimit ? ` / ${normalizedSelectedAgencyTerminalLimit}` : ''}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={resetForm} disabled={isLoading}>Annuler</Button>
            </DialogClose>
            <Button
              onClick={handleSaveTerminal}
              disabled={!agenceId || !formData.ref || isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {isLoading ? 'Enregistrement...' : 'Mettre à jour le terminal'}
            </Button>
          </DialogFooter>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!showEquipmentManagement) {
    return (
      <>
        {configurationContent}
        {editDialog}
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Tabs defaultValue="terminaux" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="terminaux">Configuration Terminaux</TabsTrigger>
            <TabsTrigger value="equipements">Gestion de sous-ensembles</TabsTrigger>
          </TabsList>

          <TabsContent value="terminaux">{configurationContent}</TabsContent>

          <TabsContent value="equipements">
            <EquipmentManager canManage={canManage} readOnlyMessage={readOnlyMessage} />
          </TabsContent>
        </Tabs>
      </div>
      {editDialog}
    </>
  );
};

export default ConfigurationTab;
