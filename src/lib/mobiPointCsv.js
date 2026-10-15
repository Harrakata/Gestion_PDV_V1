import { findMobiValidityConflict, isValidMobiDate } from './mobiPointValidity.js';

export const MOBI_POINT_CSV_COLUMNS = [
  'codePointVente', 'region', 'agenceNom', 'terminalReference',
  'guichetiereMatricule', 'dateDebutValidite', 'dateFinValidite',
];

const normalize = (value) => String(value ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

const csvDate = (value) => {
  const raw = String(value || '').trim();
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return french ? `${french[3]}-${french[2]}-${french[1]}` : raw;
};

export const prepareMobiPointImport = (records, { points, regions, agences, terminaux, guichetieres, today, uidFactory }) => {
  const rows = [];
  const errors = [];
  const existingCodes = new Set(points.map((point) => normalize(point.codePointVente)).filter(Boolean));
  const staged = [];

  records.forEach((record, index) => {
    const line = index + 2;
    const codePointVente = String(record.codePointVente || '').trim();
    const regionValue = String(record.region || '').trim();
    const agenceValue = String(record.agenceNom || '').trim();
    const terminalValue = String(record.terminalReference || '').trim();
    const matriculeValue = String(record.guichetiereMatricule || '').trim();
    const dateDebutValidite = csvDate(record.dateDebutValidite);
    const dateFinValidite = csvDate(record.dateFinValidite);
    const region = regions.find((item) => normalize(item.nom) === normalize(regionValue)
      || normalize(item.codeRegion) === normalize(regionValue));
    const agence = agences.find((item) => normalize(item.nom) === normalize(agenceValue));
    const terminal = terminaux.find((item) => normalize(item.reference) === normalize(terminalValue));
    const guichetiere = guichetieres.find((item) => normalize(item.matricule) === normalize(matriculeValue));
    let message = '';

    if (!codePointVente || !regionValue || !agenceValue || !terminalValue || !matriculeValue || !dateDebutValidite) {
      message = 'Champs obligatoires manquants.';
    } else if (existingCodes.has(normalize(codePointVente))) {
      message = `Le code ${codePointVente} existe déjà.`;
    } else if (!region) {
      message = `Région inconnue : ${regionValue}.`;
    } else if (!agence || normalize(agence.region) !== normalize(region.nom)) {
      message = `Agence inconnue dans la région ${region.nom} : ${agenceValue}.`;
    } else if (!terminal || terminal.statut !== 'Actif') {
      message = `Terminal actif introuvable : ${terminalValue}.`;
    } else if (!guichetiere || normalize(guichetiere.agenceAssigne) !== normalize(agence.nom)) {
      message = `Guichetière indisponible pour ${agence.nom} : ${matriculeValue}.`;
    } else if (!isValidMobiDate(dateDebutValidite) || dateDebutValidite > today
      || dateFinValidite && (!isValidMobiDate(dateFinValidite) || dateFinValidite < today
        || dateFinValidite < dateDebutValidite)) {
      message = 'Période de validité invalide.';
    }

    if (message) {
      errors.push({ line, message });
      return;
    }

    const payload = {
      pointVenteUid: uidFactory(), codePointVente, region: region.nom,
      agenceNom: agence.nom, agenceCodePDV: agence.codePDV || null,
      terminalReference: terminal.reference, terminalModele: terminal.modele || null,
      guichetiereMatricule: String(guichetiere.matricule),
      guichetiereNom: [guichetiere.prenom, guichetiere.nom].filter(Boolean).join(' ') || null,
      dateDebutValidite, dateFinValidite: dateFinValidite || null, statut: 'Actif',
    };
    const conflict = findMobiValidityConflict(payload, [...points, ...staged], null);
    if (conflict) {
      errors.push({ line, message: `Affectation chevauchante avec ${conflict.codePointVente || conflict.terminalReference}.` });
      return;
    }
    rows.push(payload);
    staged.push({ ...payload, id: `csv-${index}` });
    existingCodes.add(normalize(codePointVente));
  });

  return { rows, errors };
};
