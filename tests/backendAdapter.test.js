const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { beforeEach, test } = require('node:test');

const scriptSource = fs.readFileSync(path.resolve(__dirname, '../visual-only/index.js'), 'utf8');

function createStubElement() {
  return {
    classList: { add: () => {}, remove: () => {} },
    textContent: '',
    innerHTML: '',
    dataset: {},
    querySelector: () => createStubElement(),
    querySelectorAll: () => [],
    appendChild: () => {},
    addEventListener: () => {},
  };
}

function createContext() {
  const document = {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => createStubElement(),
  };

  const context = {
    console,
    document,
    location: { protocol: 'https:' },
    setTimeout,
    clearTimeout,
    confirm: () => true,
  };

  const windowObj = {
    FEATURE_USE_BACKEND: false,
    TEST_BEARER_TOKEN: undefined,
    BACKEND_INVENTORY: undefined,
    setTimeout,
    clearTimeout,
    document,
  };

  windowObj.window = windowObj;
  context.window = windowObj;
  context.fetch = async () => ({ ok: false, json: async () => ({}) });
  windowObj.fetch = context.fetch;

  return vm.createContext(context);
}

let context;

beforeEach(() => {
  context = createContext();
  vm.runInContext(scriptSource, context, { filename: 'visual-only/index.js' });
  context.BackendAdapter = vm.runInContext('BackendAdapter', context);
  context.MOCK_ACCOUNTS = vm.runInContext('MOCK_ACCOUNTS', context);
  context.MOCK_BALANCES = vm.runInContext('MOCK_BALANCES', context);
  context.MOCK_TRANSACTIONS = vm.runInContext('MOCK_TRANSACTIONS', context);
});

test('fetchAccounts returns mock data when backend disabled', async () => {
  let fetchCalled = 0;
  context.fetch = async () => { fetchCalled += 1; throw new Error('fetch should not be called when backend disabled'); };
  context.window.fetch = context.fetch;
  context.window.FEATURE_USE_BACKEND = false;

  const result = await context.BackendAdapter.fetchAccounts();
  assert.deepStrictEqual(result, context.MOCK_ACCOUNTS);
  assert.strictEqual(fetchCalled, 0);
});

test('fetchCachedBalance returns mock balances when backend disabled', async () => {
  let fetchCalled = 0;
  context.fetch = async () => { fetchCalled += 1; throw new Error('fetch should not be called when backend disabled'); };
  context.window.fetch = context.fetch;
  context.window.FEATURE_USE_BACKEND = false;

  const result = await context.BackendAdapter.fetchCachedBalance('acc_checking');
  assert.deepStrictEqual(result, context.MOCK_BALANCES.acc_checking);
  assert.strictEqual(fetchCalled, 0);
});

test('fetchCachedTransactions returns mock transactions when backend disabled', async () => {
  let fetchCalled = 0;
  context.fetch = async () => { fetchCalled += 1; throw new Error('fetch should not be called when backend disabled'); };
  context.window.fetch = context.fetch;
  context.window.FEATURE_USE_BACKEND = false;

  const result = await context.BackendAdapter.fetchCachedTransactions('acc_checking', 5);
  assert.deepStrictEqual(result, context.MOCK_TRANSACTIONS.acc_checking);
  assert.strictEqual(fetchCalled, 0);
});

test('refreshLive returns mock balance and transactions when backend disabled', async () => {
  let fetchCalled = 0;
  context.fetch = async () => { fetchCalled += 1; throw new Error('fetch should not be called when backend disabled'); };
  context.window.fetch = context.fetch;
  context.window.FEATURE_USE_BACKEND = false;

  const result = await context.BackendAdapter.refreshLive('acc_checking', 5);
  assert.strictEqual(result.balance, context.MOCK_BALANCES.acc_checking);
  assert.strictEqual(result.transactions, context.MOCK_TRANSACTIONS.acc_checking);
  assert.strictEqual(fetchCalled, 0);
});

test('fetchManualData returns manual defaults when backend disabled', async () => {
  let fetchCalled = 0;
  context.fetch = async () => { fetchCalled += 1; throw new Error('fetch should not be called when backend disabled'); };
  context.window.fetch = context.fetch;
  context.window.FEATURE_USE_BACKEND = false;

  const result = await context.BackendAdapter.fetchManualData('acc_checking');
  assert.strictEqual(result.account_id, 'acc_checking');
  assert.strictEqual(result.rent_roll, null);
  assert.strictEqual(result.updated_at, null);
  assert.strictEqual(fetchCalled, 0);
});
