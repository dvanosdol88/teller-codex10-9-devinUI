window.FEATURE_USE_BACKEND = false;
window.TEST_BEARER_TOKEN = undefined;


const BackendAdapter = (() => {
  const state = {
    apiBaseUrl: "/api",
    bearerToken: undefined,
  };

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
        if (cfg && typeof cfg.apiBaseUrl === 'string' && cfg.apiBaseUrl.trim()) {
          state.apiBaseUrl = cfg.apiBaseUrl;
        }
        if (cfg && typeof cfg.FEATURE_USE_BACKEND === 'boolean') {
          window.FEATURE_USE_BACKEND = cfg.FEATURE_USE_BACKEND;
        }
      }
    } catch {}
    return { enabled: Boolean(window.FEATURE_USE_BACKEND), apiBaseUrl: state.apiBaseUrl };
  }

  function headers() {
    const h = { "Accept": "application/json" };
    const token = window.TEST_BEARER_TOKEN || state.bearerToken;
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  function setBearerToken(token) {
    state.bearerToken = token;
    console.log('[BackendAdapter] Bearer token set');
  }

  async function fetchAccounts() {
    if (!isBackendEnabled()) return MOCK_ACCOUNTS;
    try {
      const resp = await fetch(`${state.apiBaseUrl}/db/accounts`, { headers: headers() });
      if (!resp.ok) throw new Error("accounts failed");
      const data = await resp.json();
      return (data.accounts || []).map(a => ({
        id: a.id,
        name: a.name,
        institution: a.institution,
        last_four: a.last_four,
        currency: a.currency,
        type: a.type,        // "depository", "credit", etc.
        subtype: a.subtype   // "checking", "savings", etc.
      }));
    } catch {
      return MOCK_ACCOUNTS;
    }
  }

  async function fetchCachedBalance(accountId) {
    if (!isBackendEnabled()) return MOCK_BALANCES[accountId];
    try {
      const resp = await fetch(`${state.apiBaseUrl}/db/accounts/${encodeURIComponent(accountId)}/balances`, { headers: headers() });
      if (!resp.ok) throw new Error("balance failed");
      const data = await resp.json();
      return { ...data.balance, cached_at: data.cached_at };
    } catch {
      return MOCK_BALANCES[accountId];
    }
  }

  async function fetchCachedTransactions(accountId, limit = 10) {
    if (!isBackendEnabled()) return (MOCK_TRANSACTIONS[accountId] || []);
    try {
      const url = `${state.apiBaseUrl}/db/accounts/${encodeURIComponent(accountId)}/transactions?limit=${limit}`;
      const resp = await fetch(url, { headers: headers() });
      if (!resp.ok) throw new Error("transactions failed");
      const data = await resp.json();
      return data.transactions || [];
    } catch {
      return (MOCK_TRANSACTIONS[accountId] || []);
    }
  }

  async function refreshLive(accountId, count = 10) {
    if (!isBackendEnabled()) return { balance: MOCK_BALANCES[accountId], transactions: (MOCK_TRANSACTIONS[accountId] || []) };
    try {
      const [bResp, tResp] = await Promise.all([
        fetch(`${state.apiBaseUrl}/accounts/${encodeURIComponent(accountId)}/balances`, { headers: headers() }),
        fetch(`${state.apiBaseUrl}/accounts/${encodeURIComponent(accountId)}/transactions?count=${count}`, { headers: headers() }),
      ]);
      if (!bResp.ok || !tResp.ok) throw new Error("live refresh failed");
      const balanceData = await bResp.json();
      const txsData = await tResp.json();
      
      // Backend balance response is { account_id, balance: {...} }
      // Extract the nested balance object
      const balance = balanceData.balance || balanceData;
      
      // Backend transactions response is { account_id, transactions: [...] }
      // Extract the transactions array
      const transactions = txsData.transactions || [];
      
      return { balance, transactions };
    } catch (err) {
      console.error('[BackendAdapter.refreshLive] error:', err);
      return { balance: MOCK_BALANCES[accountId], transactions: (MOCK_TRANSACTIONS[accountId] || []) };
    }
  }

  async function fetchManualData(accountId) {
    if (!isBackendEnabled()) return { account_id: accountId, rent_roll: null, updated_at: null };
    try {
      const resp = await fetch(`${state.apiBaseUrl}/db/accounts/${encodeURIComponent(accountId)}/manual-data`, { headers: headers() });
      if (!resp.ok) return { account_id: accountId, rent_roll: null, updated_at: null };
      return await resp.json();
    } catch {
      return { account_id: accountId, rent_roll: null, updated_at: null };
    }
  }

  async function saveManualData(accountId, rentRoll) {
    if (!isBackendEnabled()) throw new Error("Backend not enabled");
    const resp = await fetch(`${state.apiBaseUrl}/db/accounts/${encodeURIComponent(accountId)}/manual-data`, {
      method: 'PUT',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ rent_roll: rentRoll })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ description: 'Failed to save' }));
      throw new Error(err.description || 'Failed to save');
    }
    return await resp.json();
  }

  return {
    loadConfig,
    isBackendEnabled,
    setBearerToken,
    fetchAccounts,
    fetchCachedBalance,
    fetchCachedTransactions,
    refreshLive,
    fetchManualData,
    saveManualData
  };
})();
const MOCK_ACCOUNTS = [
  { id: 'acc_llc_checking', name: 'LLC Checking', institution: 'Demo Bank', last_four: '1234', currency: 'USD', type: 'depository', subtype: 'checking' },
  { id: 'acc_llc_savings', name: 'LLC Savings', institution: 'Demo Bank', last_four: '9876', currency: 'USD', type: 'depository', subtype: 'savings' }
];

const MOCK_BALANCES = {
  acc_llc_checking: { available: 3500.00, ledger: 3500.00, currency: 'USD', cached_at: new Date().toISOString() },
  acc_llc_savings: { available: 12000.00, ledger: 12000.00, currency: 'USD', cached_at: new Date().toISOString() }
};

const MOCK_TRANSACTIONS = {
  acc_llc_checking: [
    { description: 'Rent Payment - Unit 1', amount: 1200.00, date: '2025-10-01' },
    { description: 'Mortgage Payment', amount: -850.00, date: '2025-10-05' },
    { description: 'HOA Fee', amount: -150.00, date: '2025-10-10' },
    { description: 'Property Insurance', amount: -200.00, date: '2025-10-12' },
  ],
  acc_llc_savings: [
    { description: 'Emergency Fund Transfer', amount: 2000.00, date: '2025-09-15' }
  ]
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
