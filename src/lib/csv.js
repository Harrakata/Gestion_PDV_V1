const countDelimiter = (line, delimiter) => {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
};

export const detectCsvDelimiter = (line = '') =>
  [';', ',', '\t'].reduce(
    (best, delimiter) => {
      const count = countDelimiter(line, delimiter);
      return count > best.count ? { delimiter, count } : best;
    },
    { delimiter: ',', count: -1 }
  ).delimiter;

export const parseCsvLine = (line = '', delimiter = ',') => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values.map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value));
};

export const parseCsv = (text = '') => {
  const rows = String(text).split(/\r?\n/).filter((row) => row.trim() !== '');
  if (rows.length < 2) throw new Error('Fichier CSV vide ou en-têtes manquants.');

  const delimiter = detectCsvDelimiter(rows[0].trim());
  const headers = parseCsvLine(rows[0].trim(), delimiter);
  const records = rows.slice(1).map((row) => {
    const values = parseCsvLine(row, delimiter);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {});
  });

  return { headers, records, delimiter };
};

export const summarizeHeaders = (headers = []) => {
  if (!headers.length) return 'aucune colonne détectée';
  const preview = headers.slice(0, 5).join(', ');
  return headers.length > 5 ? `${preview} (+${headers.length - 5})` : preview;
};

export const assertCsvHeaders = (headers = [], requiredHeaders = []) => {
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Colonnes manquantes: ${missingHeaders.join(', ')}. Colonnes détectées: ${summarizeHeaders(headers)}.`);
  }
};

const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildCsv = (rows = [], columns = [], delimiter = ';') => {
  if (!rows || rows.length === 0) return '';
  const normalizedColumns = columns.map((column) =>
    typeof column === 'string' ? { key: column, label: column } : column
  );
  const headers = normalizedColumns.map((column) => column.label || column.key).join(delimiter);
  const lines = rows.map((row) =>
    normalizedColumns
      .map((column) => {
        const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
        return escapeCsvValue(value);
      })
      .join(delimiter)
  );
  return `${headers}\n${lines.join('\n')}`;
};

export const downloadCsv = (rows = [], columns = [], filename = 'export.csv', delimiter = ';') => {
  const csv = buildCsv(rows, columns, delimiter);
  if (!csv) return false;

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};

export const readCsvFile = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Aucun fichier sélectionné.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        resolve(parseCsv(event.target.result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
    reader.readAsText(file, 'UTF-8');
  });
