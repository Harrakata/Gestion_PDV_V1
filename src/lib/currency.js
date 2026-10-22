export const DEFAULT_CLIENT_CURRENCY = 'XOF';

export const CLIENT_CURRENCY_OPTIONS = [
  { value: 'XOF', label: 'Franc CFA BCEAO (XOF)' },
  { value: 'XAF', label: 'Franc CFA CEMAC (XAF)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'USD', label: 'Dollar américain (USD)' },
  { value: 'GBP', label: 'Livre sterling (GBP)' },
  { value: 'MAD', label: 'Dirham marocain (MAD)' },
  { value: 'DZD', label: 'Dinar algérien (DZD)' },
  { value: 'TND', label: 'Dinar tunisien (TND)' },
  { value: 'GNF', label: 'Franc guinéen (GNF)' },
  { value: 'CDF', label: 'Franc congolais (CDF)' },
  { value: 'NGN', label: 'Naira nigérian (NGN)' },
  { value: 'GHS', label: 'Cedi ghanéen (GHS)' },
  { value: 'MRU', label: 'Ouguiya mauritanienne (MRU)' },
  { value: 'SLE', label: 'Leone sierra-léonais (SLE)' },
  { value: 'ZAR', label: 'Rand sud-africain (ZAR)' },
  { value: 'KES', label: 'Shilling kényan (KES)' },
  { value: 'UGX', label: 'Shilling ougandais (UGX)' },
  { value: 'RWF', label: 'Franc rwandais (RWF)' },
  { value: 'BIF', label: 'Franc burundais (BIF)' },
  { value: 'CAD', label: 'Dollar canadien (CAD)' },
];

const supportedCurrencies = new Set(CLIENT_CURRENCY_OPTIONS.map((option) => option.value));

export const normalizeClientCurrency = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return supportedCurrencies.has(normalized) ? normalized : DEFAULT_CLIENT_CURRENCY;
};

export const formatCurrencyValue = (value, currency = DEFAULT_CLIENT_CURRENCY, options = {}) => {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: normalizeClientCurrency(currency),
    currencyDisplay: 'symbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(amount);
};

export const formatCompactCurrencyValue = (value, currency = DEFAULT_CLIENT_CURRENCY) =>
  formatCurrencyValue(value, currency, { notation: 'compact', maximumFractionDigits: 1 });
