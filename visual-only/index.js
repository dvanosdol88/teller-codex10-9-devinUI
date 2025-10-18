window.FEATURE_USE_BACKEND = false;
window.TEST_BEARER_TOKEN = undefined;


const BackendAdapter = (() => {
  const state = {
    apiBaseUrl: "/api",
    auth: {
      header: "Authorization",
      scheme: "Bearer",
      prefix: undefined,
      token: undefined,
      value: undefined,
    },
    staticHeaders: {},
    extras: {},
  };

  const backendInventory = (typeof window !== 'undefined' && window.BACKEND_INVENTORY) || {};
  const endpointTemplates = createEndpointTemplates(backendInventory);

  function isBackendEnabled() {
    return Boolean(window.FEATURE_USE_BACKEND);
  }

  async function loadConfig() {
    try {
      if (typeof location !== 'undefined' && location.protocol === 'file:') {
        return { enabled: Boolean(window.FEATURE_USE_BACKEND), apiBaseUrl: state.apiBaseUrl };
      }
      const resp = await fetch('/api/config', { headers: { Accept: 'application/json' } });
      if (resp && resp.ok) {
        const cfg = await resp.json().catch(() => ({}));
        const mapped = mapBackendConfig(cfg);
        if (mapped.apiBaseUrl) {
          state.apiBaseUrl = mapped.apiBaseUrl;
        }
        if (typeof mapped.featureUseBackend === 'boolean') {
          window.FEATURE_USE_BACKEND = mapped.featureUseBackend;
        }
        if (mapped.auth) {
          state.auth = { ...state.auth, ...mapped.auth };
        }
        if (mapped.staticHeaders) {
          state.staticHeaders = mapped.staticHeaders;
        }
        if (mapped.extras) {
          state.extras = mapped.extras;
        }
      }
    } catch {}
    return { enabled: Boolean(window.FEATURE_USE_BACKEND), apiBaseUrl: state.apiBaseUrl };
  }

  function headers() {
    const h = { "Accept": "application/json" };
    if (state.staticHeaders && typeof state.staticHeaders === 'object') {
      for (const [key, value] of Object.entries(state.staticHeaders)) {
        if (value != null) {
          h[key] = value;
        }
      }
    }
    const tokenOverride = window.TEST_BEARER_TOKEN;
    const authConfig = state.auth || {};
    const headerName = authConfig.header || 'Authorization';
    let headerValue = authConfig.value;
    const token = tokenOverride || authConfig.token;
    if (!headerValue && token) {
      const prefix = authConfig.prefix != null ? authConfig.prefix : (authConfig.scheme ? `${authConfig.scheme} ` : '');
      headerValue = `${prefix || ''}${token}`.trim();
    }
    if (headerValue) {
      h[headerName] = headerValue;
    }
    return h;
  }

  async function fetchAccounts() {
    if (!isBackendEnabled()) return MOCK_ACCOUNTS;
    try {
      const url = buildUrl(endpointTemplates.accounts);
      const resp = await fetch(url, { headers: headers() });
      if (!resp.ok) throw new Error("accounts failed");
      const data = await resp.json();
      const normalized = applyTranslation("accounts", data);
      return Array.isArray(normalized) && normalized.length ? normalized : [];
    } catch {
      return MOCK_ACCOUNTS;
    }
  }

  async function fetchCachedBalance(accountId) {
    if (!isBackendEnabled()) return MOCK_BALANCES[accountId];
    try {
      const url = buildUrl(endpointTemplates.cachedBalance, { accountId });
      const resp = await fetch(url, { headers: headers() });
      if (!resp.ok) throw new Error("balance failed");
      const data = await resp.json();
      const normalized = applyTranslation("cachedBalance", data, { accountId });
      return normalized || MOCK_BALANCES[accountId];
    } catch {
      return MOCK_BALANCES[accountId];
    }
  }

  async function fetchCachedTransactions(accountId, limit = 10) {
    if (!isBackendEnabled()) return (MOCK_TRANSACTIONS[accountId] || []);
    try {
      const url = buildUrl(endpointTemplates.cachedTransactions, { accountId, limit }, { limit });
      const resp = await fetch(url, { headers: headers() });
      if (!resp.ok) throw new Error("transactions failed");
      const data = await resp.json();
      const normalized = applyTranslation("cachedTransactions", data, { accountId, limit });
      return Array.isArray(normalized) ? normalized : [];
    } catch {
      return (MOCK_TRANSACTIONS[accountId] || []);
    }
  }

  async function refreshLive(accountId, count = 10) {
    if (!isBackendEnabled()) return { balance: MOCK_BALANCES[accountId], transactions: (MOCK_TRANSACTIONS[accountId] || []) };
    try {
      const [bResp, tResp] = await Promise.all([
        fetch(buildUrl(endpointTemplates.liveBalance, { accountId }), { headers: headers() }),
        fetch(buildUrl(endpointTemplates.liveTransactions, { accountId, count }, { count }), { headers: headers() }),
      ]);
      if (!bResp.ok || !tResp.ok) throw new Error("live refresh failed");
      const balanceRaw = await bResp.json();
      const txsRaw = await tResp.json();
      const balance = applyTranslation("liveBalance", balanceRaw, { accountId }) || MOCK_BALANCES[accountId];
      const transactions = applyTranslation("liveTransactions", txsRaw, { accountId, count }) || [];
      return { balance, transactions: Array.isArray(transactions) ? transactions : [] };
    } catch {
      return { balance: MOCK_BALANCES[accountId], transactions: (MOCK_TRANSACTIONS[accountId] || []) };
    }
  }

  function createEndpointTemplates(inventory = {}) {
    const defaults = {
      accounts: '/db/accounts',
      cachedBalance: '/db/accounts/{accountId}/balances',
      cachedTransactions: '/db/accounts/{accountId}/transactions?limit={limit}',
      liveBalance: '/accounts/{accountId}/balances',
      liveTransactions: '/accounts/{accountId}/transactions?count={count}',
      manualRentRoll: '/db/accounts/{accountId}/rent-roll',
    };
    const aliases = {
      accounts: ['accounts', 'accountsUrl', 'accountsList'],
      cachedBalance: ['cachedBalance', 'balance', 'cachedBalanceUrl', 'accountBalance'],
      cachedTransactions: ['cachedTransactions', 'transactions', 'cachedTransactionsUrl', 'accountTransactions'],
      liveBalance: ['liveBalance', 'liveBalanceUrl', 'liveAccountBalance'],
      liveTransactions: ['liveTransactions', 'liveTransactionsUrl', 'liveAccountTransactions'],
      manualRentRoll: ['manualRentRoll', 'rentRoll', 'rentRollUrl', 'manualData', 'manualDataUrl'],
    };
    const source = (inventory && (inventory.endpoints || inventory.urls)) || inventory || {};
    return Object.keys(defaults).reduce((acc, key) => {
      const options = aliases[key] || [];
      let template;
      for (const alias of options) {
        if (typeof source?.[alias] === 'string' && source[alias].trim()) {
          template = source[alias].trim();
          break;
        }
      }
      acc[key] = template || defaults[key];
      return acc;
    }, {});
  }

  function buildUrl(template, pathParams = {}, queryParams = {}) {
    const replaced = (template || '').replace(/\{(\w+)\}/g, (_, token) => {
      if (Object.prototype.hasOwnProperty.call(pathParams, token)) {
        const value = pathParams[token];
        return value == null ? '' : encodeURIComponent(value);
      }
      return '';
    });
    let url = replaced;
    const queryPairs = Object.entries(queryParams)
      .filter(([, value]) => value !== undefined && value !== null && `${value}` !== '')
      .filter(([key]) => !new RegExp(`[?&]${encodeURIComponent(key)}=`).test(replaced));
    if (queryPairs.length) {
      const query = queryPairs
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      url += (url.includes('?') ? '&' : '?') + query;
    }
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    const base = state.apiBaseUrl || '';
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedPath = url.replace(/^\/+/, '');
    if (!trimmedBase) {
      return trimmedPath ? `/${trimmedPath}` : '/';
    }
    if (!trimmedPath) {
      return trimmedBase;
    }
    return `${trimmedBase}/${trimmedPath}`;
  }

  function applyTranslation(key, payload, context) {
    const translator = translationMap[key];
    if (typeof translator === 'function') {
      try {
        const result = translator(payload, context, applyTranslation);
        if (result !== undefined) return result;
      } catch {}
    }
    const fallbackKey = translationFallbacks[key];
    if (fallbackKey && fallbackKey !== key) {
      return applyTranslation(fallbackKey, payload, context);
    }
    return undefined;
  }

  const translationFallbacks = {
    liveBalance: 'cachedBalance',
    liveTransactions: 'cachedTransactions',
  };

  const defaultTranslationMap = {
    accounts: translateAccounts,
    cachedBalance: translateCachedBalance,
    cachedTransactions: translateCachedTransactions,
    liveBalance: translateLiveBalance,
    liveTransactions: translateLiveTransactions,
    manualRentRoll: translateManualRentRoll,
  };

  const translationMap = createTranslationMap(backendInventory);

  function mapBackendConfig(rawConfig = {}) {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return {};
    }

    const normalized = {};

    const apiBaseUrl = selectFirstString([
      rawConfig.apiBaseUrl,
      rawConfig.api_base_url,
      rawConfig.api_baseUrl,
      rawConfig.api?.baseUrl,
      rawConfig.api?.base_url,
      rawConfig.api?.url,
      rawConfig.baseUrl,
      rawConfig.base_url,
    ]);
    if (apiBaseUrl) {
      normalized.apiBaseUrl = apiBaseUrl;
    }

    const featureUseBackend = selectFirstBoolean([
      rawConfig.FEATURE_USE_BACKEND,
      rawConfig.featureUseBackend,
      rawConfig.features?.useBackend,
      rawConfig.featureFlags?.useBackend,
      rawConfig.flags?.useBackend,
    ]);
    if (typeof featureUseBackend === 'boolean') {
      normalized.featureUseBackend = featureUseBackend;
    }

    const authConfig = normalizeAuthConfig(rawConfig);
    if (authConfig && Object.keys(authConfig).length) {
      normalized.auth = authConfig;
    }

    const staticHeaders = normalizeStaticHeaders(rawConfig);
    if (staticHeaders && Object.keys(staticHeaders).length) {
      normalized.staticHeaders = staticHeaders;
    }

    const extras = extractExtras(rawConfig, normalized);
    if (extras && Object.keys(extras).length) {
      normalized.extras = extras;
    }

    return normalized;
  }

  function selectFirstString(candidates = []) {
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  function selectFirstBoolean(candidates = []) {
    for (const candidate of candidates) {
      if (typeof candidate === 'boolean') {
        return candidate;
      }
    }
    return undefined;
  }

  function normalizeAuthConfig(rawConfig = {}) {
    const authBlock = rawConfig.auth || rawConfig.authentication || {};
    const tokenCandidates = [
      authBlock.token,
      authBlock.accessToken,
      authBlock.bearerToken,
      rawConfig.bearerToken,
      rawConfig.token,
      rawConfig.apiKey,
      rawConfig.api_key,
      rawConfig.key,
    ];
    const headerCandidates = [
      authBlock.header,
      authBlock.headerName,
      authBlock.header_name,
      authBlock.name,
      authBlock.key,
    ];
    const schemeCandidates = [
      authBlock.scheme,
      authBlock.type,
      authBlock.strategy,
    ];
    const prefixCandidates = [
      authBlock.prefix,
      authBlock.tokenPrefix,
      authBlock.token_prefix,
    ];
    const valueCandidates = [
      authBlock.value,
      authBlock.headerValue,
      authBlock.header_value,
    ];

    const header = selectFirstString([...headerCandidates, schemeCandidates[0] ? 'Authorization' : undefined]) || 'Authorization';
    const token = selectFirstString(tokenCandidates);
    const scheme = selectFirstString(schemeCandidates);
    const prefix = selectFirstString(prefixCandidates);
    const value = selectFirstString(valueCandidates);

    const normalized = {};
    if (header) normalized.header = header;
    if (scheme) normalized.scheme = scheme;
    if (prefix !== undefined) normalized.prefix = prefix;
    if (token) normalized.token = token;
    if (value) normalized.value = value;

    return normalized;
  }

  function normalizeStaticHeaders(rawConfig = {}) {
    const headersBlock = rawConfig.headers || rawConfig.defaultHeaders || rawConfig.staticHeaders;
    if (!headersBlock || typeof headersBlock !== 'object') {
      return undefined;
    }
    return Object.entries(headersBlock).reduce((acc, [key, value]) => {
      if (typeof key === 'string' && value != null) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  function extractExtras(rawConfig = {}, normalized = {}) {
    const knownKeys = new Set([
      'apiBaseUrl',
      'api_base_url',
      'api_baseUrl',
      'baseUrl',
      'base_url',
      'FEATURE_USE_BACKEND',
      'featureUseBackend',
      'features',
      'featureFlags',
      'flags',
      'auth',
      'authentication',
      'headers',
      'defaultHeaders',
      'staticHeaders',
    ]);

    const extras = {};
    for (const [key, value] of Object.entries(rawConfig)) {
      if (!knownKeys.has(key) && !(key in (normalized || {}))) {
        extras[key] = value;
      }
    }
    return extras;
  }

  function createTranslationMap(inventory = {}) {
    const overrides = (inventory && (inventory.translationMap || inventory.translations)) || {};
    const normalizedOverrides = Object.entries(overrides).reduce((acc, [key, translator]) => {
      if (typeof translator === 'function') acc[key] = translator;
      return acc;
    }, {});
    return { ...defaultTranslationMap, ...normalizedOverrides };
  }

  function translateAccounts(payload) {
    const list = Array.isArray(payload?.accounts) ? payload.accounts : Array.isArray(payload) ? payload : [];
    return list
      .map(normalizeAccount)
      .filter(Boolean);
  }

  function translateCachedBalance(payload) {
    const balancePayload = payload?.balance && typeof payload.balance === 'object' ? payload.balance : payload || {};
    const available = coerceNumber(balancePayload.available ?? balancePayload.available_balance ?? balancePayload.current);
    const ledger = coerceNumber(balancePayload.ledger ?? balancePayload.ledger_balance ?? balancePayload.current);
    const currency = coerceCurrency(balancePayload.currency ?? payload?.currency);
    const cachedAt = coerceTimestamp(payload?.cached_at ?? balancePayload.cached_at ?? payload?.updated_at);
    return {
      available: available ?? null,
      ledger: ledger ?? available ?? null,
      currency,
      cached_at: cachedAt,
    };
  }

  function translateCachedTransactions(payload) {
    const list = Array.isArray(payload?.transactions) ? payload.transactions : Array.isArray(payload) ? payload : [];
    return list
      .map(normalizeTransaction)
      .filter(Boolean);
  }

  function translateLiveBalance(payload) {
    return translateCachedBalance(payload);
  }

  function translateLiveTransactions(payload) {
    return translateCachedTransactions(payload);
  }

  function translateManualRentRoll(payload, context = {}) {
    const accountId = coerceId(payload?.account_id ?? payload?.accountId ?? context?.accountId);
    const rentRollRaw = payload?.rent_roll !== undefined ? payload.rent_roll : payload?.rentRoll;
    const rentRoll = rentRollRaw === null ? null : coerceNumber(rentRollRaw);
    const updatedAt = coerceTimestamp(payload?.updated_at ?? payload?.updatedAt ?? payload?.timestamp ?? payload?.updated);
    return {
      account_id: accountId ?? context?.accountId ?? null,
      rent_roll: rentRollRaw === null ? null : (rentRoll ?? null),
      updated_at: updatedAt,
    };
  }

  function normalizeAccount(account) {
    if (!account || typeof account !== 'object') return null;
    const id = coerceId(account.id ?? account.account_id ?? account.accountId ?? account.uuid ?? account.external_id);
    if (!id) return null;
    const name = coerceString(account.name ?? account.display_name ?? account.account_name) || 'Account';
    const institution = coerceString(account.institution ?? account.bank_name ?? account.institution_name ?? account.provider);
    const lastFour = coerceLastFour(account.last_four ?? account.last4 ?? account.lastFour ?? account.mask ?? account.account_number);
    const currency = coerceCurrency(account.currency ?? account.currency_code ?? account.account_currency);
    return { id, name, institution, last_four: lastFour, currency };
  }

  function normalizeTransaction(txn) {
    if (!txn || typeof txn !== 'object') return null;
    const description = coerceString(txn.description ?? txn.name ?? txn.merchant ?? txn.memo ?? txn.counterparty) || 'Transaction';
    const amount = coerceNumber(txn.amount ?? txn.value ?? txn.transaction_amount ?? txn.total);
    const date = coerceTimestamp(txn.date ?? txn.posted_at ?? txn.timestamp ?? txn.created_at ?? txn.updated_at);
    return {
      description,
      amount: amount ?? 0,
      date,
    };
  }

  function coerceString(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  function coerceId(value) {
    const str = coerceString(value);
    return str || null;
  }

  function coerceLastFour(value) {
    const digits = coerceString(value).replace(/\D+/g, '');
    if (digits.length >= 4) return digits.slice(-4);
    return digits || null;
  }

  function coerceCurrency(value) {
    const str = coerceString(value).toUpperCase();
    return str || 'USD';
  }

  function coerceNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function coerceTimestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  async function fetchManualData(accountId) {
    const defaults = { account_id: accountId ?? null, rent_roll: null, updated_at: null };
    if (!isBackendEnabled()) return defaults;
    try {
      const url = buildUrl(endpointTemplates.manualRentRoll, { accountId });
      const resp = await fetch(url, { headers: headers() });
      if (!resp.ok) return defaults;
      const data = await resp.json().catch(() => ({}));
      return applyTranslation('manualRentRoll', data, { accountId }) || defaults;
    } catch {
      return defaults;
    }
  }

  async function saveManualData(accountId, rentRoll) {
    if (!isBackendEnabled()) throw new Error("Backend not enabled");
    const url = buildUrl(endpointTemplates.manualRentRoll, { accountId });
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ rent_roll: rentRoll })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const message = extractErrorMessage(err) || resp.statusText || 'Failed to save';
      throw new Error(message);
    }
    const data = await resp.json().catch(() => ({}));
    return applyTranslation('manualRentRoll', data, { accountId }) || { account_id: accountId ?? null, rent_roll: null, updated_at: null };
  }

  function extractErrorMessage(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.description === 'string' && payload.description.trim()) return payload.description.trim();
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (Array.isArray(payload.errors)) {
      for (const err of payload.errors) {
        if (typeof err === 'string' && err.trim()) return err.trim();
        if (err && typeof err === 'object') {
          if (typeof err.message === 'string' && err.message.trim()) return err.message.trim();
          if (typeof err.description === 'string' && err.description.trim()) return err.description.trim();
        }
      }
    }
    if (payload.error) {
      const errObj = payload.error;
      if (typeof errObj === 'string' && errObj.trim()) return errObj.trim();
      if (errObj && typeof errObj === 'object') {
        if (typeof errObj.message === 'string' && errObj.message.trim()) return errObj.message.trim();
        if (typeof errObj.description === 'string' && errObj.description.trim()) return errObj.description.trim();
      }
    }
    return null;
  }

  return { loadConfig, isBackendEnabled, fetchAccounts, fetchCachedBalance, fetchCachedTransactions, refreshLive, fetchManualData, saveManualData };
})();
const MOCK_ACCOUNTS = [
  { id: 'acc_checking', name: 'Checking', institution: 'Demo Bank', last_four: '1234', currency: 'USD' },
  { id: 'acc_savings', name: 'Savings', institution: 'Demo Bank', last_four: '9876', currency: 'USD' }
];

const MOCK_BALANCES = {
  acc_checking: { available: 1250.25, ledger: 1300.25, currency: 'USD', cached_at: new Date().toISOString() },
  acc_savings: { available: 8200.00, ledger: 8200.00, currency: 'USD', cached_at: new Date().toISOString() }
};

const MOCK_TRANSACTIONS = {
  acc_checking: [
    { description: 'Coffee Shop', amount: -3.75, date: '2025-10-08' },
    { description: 'Payroll', amount: 2500.00, date: '2025-10-01' },
  ],
  acc_savings: []
};

function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message || '';
  el.classList.remove('hidden');
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => el.classList.add('hidden'), 2200);
}

function formatCurrency(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value));
  } catch {
    return `${value}`;
  }
}

function formatAmount(value, currency = 'USD') {
  const s = formatCurrency(value, currency);
  if (typeof value === 'number' && value < 0) return s;
  return s;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return `${ts}`;
  }
}

function formatTimeAgo(ts) {
  if (!ts) return '—';
  try {
    const now = new Date();
    const then = new Date(ts);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return formatTimestamp(ts);
  } catch {
    return formatTimestamp(ts);
  }
}

async function renderCard(account) {
  const template = document.getElementById('account-card-template');
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.accountId = account.id;

  node.querySelectorAll('.flip-btn').forEach(btn => {
    btn.addEventListener('click', () => node.classList.toggle('is-flipped'));
  });

  node.querySelectorAll('.account-name').forEach(el => el.textContent = account.name || 'Account');
  const subtitle = [account.institution, account.last_four ? `•••• ${account.last_four}` : null].filter(Boolean).join(' · ');
  node.querySelectorAll('.account-subtitle').forEach(el => el.textContent = subtitle);

  const bal = await BackendAdapter.fetchCachedBalance(account.id);
  node.querySelector('.balance-available').textContent = formatCurrency(bal.available, account.currency);
  node.querySelector('.balance-ledger').textContent = formatCurrency(bal.ledger, account.currency);
  node.querySelector('.balance-cached').textContent = `Cached: ${formatTimestamp(bal.cached_at)}`;

  const list = node.querySelector('.transactions-list');
  list.innerHTML = '';
  const txs = await BackendAdapter.fetchCachedTransactions(account.id, 10);
  if (!txs.length) {
    node.querySelector('.transactions-empty').classList.remove('hidden');
  } else {
    node.querySelector('.transactions-empty').classList.add('hidden');
    txs.forEach(tx => {
      const li = document.createElement('li');
      const details = document.createElement('div');
      details.className = 'details';
      const description = document.createElement('span');
      description.className = 'description';
      description.textContent = tx.description || 'Transaction';
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = tx.date ? new Date(tx.date).toLocaleDateString() : '';
      details.append(description, date);
      const amount = document.createElement('span');
      amount.className = 'amount';
      amount.textContent = formatAmount(tx.amount, account.currency);
      li.append(details, amount);
      list.appendChild(li);
    });
  }
  node.querySelector('.transactions-cached').textContent = `Cached: ${formatTimestamp(bal.cached_at)}`;

  const refreshBtn = node.querySelector('.refresh-btn');
  refreshBtn.addEventListener('click', () => showToast('Demo: no live refresh in visual-only mode'));

  const toggleBtns = node.querySelectorAll('.toggle-btn');
  const viewPanels = node.querySelectorAll('.view-panel');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.view === targetView));
      viewPanels.forEach(panel => {
        if (panel.classList.contains(targetView)) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });
    });
  });

  const manualData = await BackendAdapter.fetchManualData(account.id);
  const rentRollValue = node.querySelector('.rent-roll-value');
  const manualDataUpdated = node.querySelector('.manual-data-updated');
  
  if (manualData.rent_roll !== null) {
    rentRollValue.textContent = formatCurrency(manualData.rent_roll, account.currency);
  } else {
    rentRollValue.textContent = '—';
  }
  
  if (manualData.updated_at) {
    manualDataUpdated.textContent = `Last updated: ${formatTimeAgo(manualData.updated_at)}`;
  } else {
    manualDataUpdated.textContent = '—';
  }

  const editBtn = node.querySelector('.edit-manual-data-btn');
  editBtn.addEventListener('click', () => openManualDataModal(account.id, manualData.rent_roll, account.currency));

  return node;
}

async function init() {
  const grid = document.getElementById('accounts-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  const accounts = await BackendAdapter.fetchAccounts();
  if (!accounts.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const acc of accounts) {
    const card = await renderCard(acc);
    grid.appendChild(card);
  }
}

function openManualDataModal(accountId, currentValue, currency) {
  const modal = document.getElementById('manual-data-modal');
  const input = document.getElementById('rent-roll-input');
  const saveBtn = modal.querySelector('.modal-save');
  const cancelBtn = modal.querySelector('.modal-cancel');
  const clearBtn = modal.querySelector('.modal-clear');
  const closeBtn = modal.querySelector('.modal-close');
  const overlay = modal.querySelector('.modal-overlay');

  input.value = currentValue !== null ? currentValue : '';
  modal.classList.remove('hidden');

  const close = () => {
    modal.classList.add('hidden');
    input.value = '';
  };

  const save = async (valueToSave) => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await BackendAdapter.saveManualData(accountId, valueToSave);
      showToast('Manual data saved successfully');
      close();
      await init();
    } catch (err) {
      showToast(err.message || 'Failed to save');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };

  const saveHandler = () => {
    const value = input.value.trim();
    if (value === '') {
      showToast('Please enter a value or use Clear');
      return;
    }
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      showToast('Please enter a valid non-negative number');
      return;
    }
    save(numValue);
  };

  const clearHandler = () => {
    if (confirm('Clear rent roll value?')) {
      save(null);
    }
  };

  saveBtn.addEventListener('click', saveHandler);
  clearBtn.addEventListener('click', clearHandler);
  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveHandler();
  });
}

async function boot() {
  try {
    await BackendAdapter.loadConfig();
  } catch {}
  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
}
boot();
