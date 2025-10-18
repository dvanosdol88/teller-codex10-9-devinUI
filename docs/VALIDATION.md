# Validation Procedures

This document provides step-by-step validation procedures for the Teller Cached Dashboard integration. These procedures ensure the system works correctly in different scenarios and can be safely rolled back if needed.

## Prerequisites

### Serving the UI

The UI can be served in two ways:

1. **File protocol** (simple, limited):
   ```bash
   # Simply open the file in a browser
   open visual-only/index.html
   # or double-click visual-only/index.html in your file explorer
   ```
   Note: ES modules may have limitations with file:// protocol.

2. **HTTP server** (recommended):
   ```bash
   # Using Python
   python3 -m http.server 8000
   # Then navigate to http://localhost:8000/visual-only/index.html

   # Or using Node.js
   npx http-server -p 8000
   # Then navigate to http://localhost:8000/visual-only/index.html
   ```

### DevTools Access

All validation procedures require browser DevTools access:
- Chrome/Edge: Press `F12` or `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)
- Firefox: Press `F12` or `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)

Key DevTools panels:
- **Console**: Check for errors and warnings
- **Network**: Monitor HTTP requests
- **Application > Storage**: Check localStorage/sessionStorage

## Scenario 1: Default Mode (Backend Disabled)

**Purpose**: Verify the UI works purely as a static snapshot with zero network calls.

**Configuration**:
- Default settings (no changes needed)
- `window.FEATURE_USE_BACKEND` should be `false`

**Steps**:

1. Serve the UI using one of the methods above
2. Open the page in your browser
3. Open DevTools

**Verification Checklist**:

- [ ] **Network Tab**: Zero HTTP requests (except for initial page load assets)
  - Filter by XHR/Fetch to ensure no API calls
  - Should see NO requests to `/api/config` or `/api/db/*`

- [ ] **Console**: Zero errors, zero warnings
  - Check for any red error messages
  - Check for any yellow warning messages

- [ ] **Application > Storage**: No localStorage or sessionStorage writes
  - Expand Local Storage and Session Storage
  - Should see no entries created by the application

- [ ] **UI Rendering**:
  - Cards display with mock data (Checking and Savings accounts)
  - Available balance: $1,250.25 (Checking), $8,200.00 (Savings)
  - Ledger balance: $1,300.25 (Checking), $8,200.00 (Savings)
  - Transactions show for Checking account (Coffee Shop, Payroll)

- [ ] **Card Flip Interaction**:
  - Click the "↺" button on any card
  - Card should flip to show transactions on the back
  - Click "↺" again to flip back
  - Animation should be smooth

- [ ] **Refresh Button**:
  - Click "Refresh" on any card
  - Toast message appears: "Demo: no live refresh in visual-only mode"
  - Toast disappears after ~2 seconds
  - No network requests made

**Expected Result**: UI is fully functional with mock data, zero network activity, zero errors.

## Scenario 2: Backend Enabled but Unreachable

**Purpose**: Verify graceful fallback to mock data when backend is unavailable.

**Configuration**:
1. Open DevTools Console
2. Run: `window.FEATURE_USE_BACKEND = true`
3. Reload the page

**Steps**:

1. Serve the UI
2. Open the page in your browser
3. Open DevTools Console
4. Set `window.FEATURE_USE_BACKEND = true`
5. Press `Ctrl+R` or `Cmd+R` to reload the page

**Verification Checklist**:

- [ ] **Network Tab**: Requests are made but fail
  - Should see GET request to `/api/config` (may be 404 or failed)
  - Should see GET requests to `/api/db/accounts` and related endpoints
  - All backend requests show as failed/404 (red in Network tab)

- [ ] **Console**: No uncaught errors
  - Failed fetch requests may appear but should not be unhandled
  - No red "Uncaught" errors
  - UI silently falls back to mocks

- [ ] **UI Rendering**: Same as Scenario 1
  - Cards display with mock data
  - All balances and transactions match mock data
  - UI is fully interactive

- [ ] **Fallback Behavior**:
  - Despite network failures, UI remains stable
  - No broken states or missing data
  - All interactions still work

**Expected Result**: Backend requests are attempted but fail gracefully. UI falls back to mock data without errors or broken states.

## Scenario 2b: Manual Backend Disable Toggle

**Purpose**: Verify that flipping `FEATURE_USE_BACKEND` off at runtime returns the UI to mock content.

**Configuration**:
- Begin from Scenario 2 (backend enabled) or Scenario 3 (backend serving data)
- DevTools Console access

**Steps**:

1. Open DevTools Console
2. Run: `window.FEATURE_USE_BACKEND = false`
3. Reload the page

**Verification Checklist**:

- [ ] **Network Tab**: No new requests to `/api/config` or `/api/db/*`
- [ ] **Console**: No errors while reloading with the flag disabled
- [ ] **UI Rendering**: Cards revert to mock balances ($1,250.25 / $8,200.00) and mock transactions (Coffee Shop, Payroll)

**Expected Result**: After reloading with the flag set to `false`, the UI renders the mock dataset and does not attempt backend calls.

## Scenario 3: Backend Enabled and Reachable

**Purpose**: Verify integration with live backend returns cached data correctly.

**Prerequisites**:
- Backend service must be running and accessible
- Backend `/api/config` endpoint configured
- Backend `/api/db/*` endpoints available

**Configuration**:

Backend must return from `/api/config`:
```json
{
  "apiBaseUrl": "/api",
  "FEATURE_USE_BACKEND": true
}
```

**Steps**:

1. Ensure backend is running and accessible
2. Serve the UI from the same origin as the backend (to avoid CORS)
3. Open the page in your browser
4. Open DevTools

**Verification Checklist**:

- [ ] **Network Tab**: Successful backend requests
  - GET `/api/config` returns 200 OK
  - Response contains `apiBaseUrl` and `FEATURE_USE_BACKEND: true`
  - GET `/api/db/accounts` returns 200 OK with account data
  - GET `/api/db/accounts/{id}/balances` returns 200 OK with balance data
  - GET `/api/db/accounts/{id}/transactions?limit=10` returns 200 OK with transaction data

- [ ] **Console**: Zero errors
  - No failed requests
  - No uncaught errors
  - Backend data loads successfully

- [ ] **UI Rendering**: Backend data displayed
  - Cards display accounts from backend
  - Balances match backend cached data
  - Transactions match backend cached data
  - "Cached at" timestamps show backend cache times

- [ ] **Data Parity**:
  - Compare data in UI with backend responses
  - All fields should match exactly
  - Currency formatting should be correct
  - Timestamps should be properly formatted

**Expected Result**: UI successfully loads and displays data from backend. All network requests return 200 OK. UI shows backend data instead of mocks.

## Scenario 4: Token Handling

**Purpose**: Verify Authorization header is sent when token is present.

**Configuration**:
1. Open DevTools Console
2. Run: `window.TEST_BEARER_TOKEN = "test_token_12345"`
3. Run: `window.FEATURE_USE_BACKEND = true`
4. Reload the page

**Steps**:

1. Serve the UI
2. Open DevTools Console
3. Set both flags as shown above
4. Reload the page
5. Check Network tab for request headers

**Verification Checklist**:

- [ ] **Network Tab**: Authorization header present
  - Click any `/api/*` request in Network tab
  - Go to "Headers" section
  - Under "Request Headers", find `Authorization`
  - Value should be `Bearer test_token_12345`

- [ ] **Console**: Check token value
  - Run: `window.TEST_BEARER_TOKEN`
  - Should return the token string

- [ ] **No Persistence**: Token not stored
  - Check Application > Storage > Local Storage: Should be empty
  - Check Application > Storage > Session Storage: Should be empty
  - Token only exists in memory (window.TEST_BEARER_TOKEN)

- [ ] **Token Removal**:
  - Run: `window.TEST_BEARER_TOKEN = undefined`
  - Reload page
  - Check Network requests: No Authorization header

**Expected Result**: When token is set, all backend requests include `Authorization: Bearer {token}` header. Token is never persisted to storage.

## UI Parity Checks

These checks should be performed in all scenarios to ensure UI consistency:

- [ ] **Page Load**: No visible lag or flashing
- [ ] **Card Layout**: Cards display in grid layout
- [ ] **Typography**: All text is readable and properly styled
- [ ] **Card Front**:
  - Account name and subtitle displayed
  - Available and Ledger balances shown
  - "Cached at" timestamp displayed
  - Refresh button present

- [ ] **Card Back**:
  - Transactions list displayed
  - Each transaction shows description, date, and amount
  - "No cached transactions" message if empty
  - "Cached at" timestamp displayed

- [ ] **Interactions**:
  - Card flip animation smooth
  - Refresh button shows toast
  - Toast appears and disappears correctly
  - No UI glitches or broken states

## Rollback Verification

**Purpose**: Verify instant rollback by disabling backend integration.

**Method 1: Via /api/config**

If backend is running:
1. Update backend `/api/config` to return `FEATURE_USE_BACKEND: false`
2. Reload the UI in browser
3. Verify Scenario 1 checklist (default mode)

**Method 2: Via Console**

In browser:
1. Open DevTools Console
2. Run: `window.FEATURE_USE_BACKEND = false`
3. Reload the page
4. Verify Scenario 1 checklist (default mode)

**Verification**:
- [ ] Network requests stop (except initial page load)
- [ ] UI switches to mock data
- [ ] No errors in console
- [ ] UI remains fully functional

**Expected Result**: Setting flag to false instantly reverts UI to static-only behavior. No redeployment needed.

## Automated Validation Script

While manual validation is recommended, you can use this browser console script to check basic functionality:

```javascript
// Run this in browser console after page loads
(async function validateUI() {
  const results = {
    featureFlag: typeof window.FEATURE_USE_BACKEND === 'boolean',
    backendAdapter: typeof BackendAdapter === 'object',
    hasLoadConfig: typeof BackendAdapter?.loadConfig === 'function',
    hasFetchAccounts: typeof BackendAdapter?.fetchAccounts === 'function',
    dom: {
      grid: !!document.getElementById('accounts-grid'),
      toast: !!document.getElementById('toast'),
      template: !!document.getElementById('account-card-template')
    },
    rendering: document.querySelectorAll('.card').length > 0
  };
  
  console.log('Validation Results:', results);
  console.log('Backend Enabled:', BackendAdapter.isBackendEnabled());
  console.log('All checks passed:', Object.values(results).every(v => 
    typeof v === 'object' ? Object.values(v).every(x => x) : v
  ));
})();
```

## Troubleshooting

If validation fails, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

## Summary

These validation procedures ensure:
- ✓ Default mode works with zero network calls
- ✓ Backend mode gracefully falls back to mocks when backend is unavailable
- ✓ Backend mode correctly integrates with live backend when available
- ✓ Token handling works correctly and securely
- ✓ Rollback is instant and requires no redeployment
- ✓ UI parity is maintained across all scenarios
