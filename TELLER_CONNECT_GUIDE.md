# Teller Connect Implementation Guide

This document explains how to implement Teller Connect with TD Bank filtering and proper exit handling, as demonstrated in the production repositories.

## Overview

This visual-only repository demonstrates the UI/UX design for the Teller Dashboard. For the actual Teller Connect integration, see the production implementation in `teller10-15A` or `teller-codex10-9`.

## Key Improvements Implemented

### 1. TD Bank Institution Filtering

**Feature**: Automatically skip the institution picker and go directly to TD Bank's authentication flow.

**Implementation**:
```javascript
const connector = window.TellerConnect.setup({
  applicationId: 'your-app-id',
  environment: 'sandbox', // or 'production'
  institution: 'td_bank', // 👈 This skips the institution picker
  onSuccess: async (enrollment) => {
    // Handle successful enrollment
  },
  onExit: () => {
    // Handle widget dismissal
  },
});
```

**Why this matters**:
- Users don't see a list of banks to choose from
- Creates a streamlined experience for TD Bank customers
- Reduces friction in the connection flow
- Can be removed to restore full institution picker

**Institution ID**: `td_bank`

### 2. Fixed onExit Callback

**Problem**: The previous implementation only handled errors, not user-initiated dismissals:

```javascript
// ❌ Old implementation - only fires on errors
onExit: ({ error }) => {
  if (error) {
    console.error('Teller Connect error', error);
    showToast('Teller Connect exited with an error.', 'error');
  }
}
```

**Solution**: Always provide user feedback when widget is dismissed:

```javascript
// ✅ New implementation - fires on all dismissals
onExit: () => {
  console.log('Teller Connect widget closed');
  showToast('Connection cancelled');
}
```

**What triggers onExit**:
- Clicking the X button
- Pressing Escape key
- Clicking outside the modal
- Any error during the flow

## Teller Connect Customization Capabilities

### What You CAN Customize

1. **Institution Selection**
   - Use `institution` parameter to skip picker
   - Build your own institution picker using Teller API
   - Endpoint: `GET https://api.teller.io/institutions`

2. **Product Filtering**
   ```javascript
   products: ['transactions', 'balance', 'identity']
   ```

3. **Account Selection Behavior**
   ```javascript
   selectAccount: 'single' // or 'multiple' or 'disabled'
   ```

4. **Environment**
   ```javascript
   environment: 'sandbox' // or 'production'
   ```

5. **Event Tracking**
   ```javascript
   onEvent: (event) => {
     // Track user flow for analytics
     console.log('Teller event:', event);
   }
   ```

### What You CANNOT Customize

The Teller Connect widget is a hosted iframe solution. You **cannot**:

- ❌ Completely replace it with custom UI
- ❌ Style the widget's internal components
- ❌ Customize individual screens within the widget
- ❌ Change the authentication flow
- ❌ Access or modify credential input fields

### Building Your Own Institution Picker

If you want full control over the institution selection step:

1. **Fetch institutions from Teller API**:
   ```bash
   curl https://api.teller.io/institutions
   ```

2. **Display in your own UI**:
   ```javascript
   // Example: Show institutions in a custom grid/list
   const institutions = await fetch('https://api.teller.io/institutions').then(r => r.json());
   
   // Render your custom picker
   institutions.forEach(inst => {
     // Display inst.name, inst.logo, etc.
   });
   ```

3. **Pass selected institution to Teller Connect**:
   ```javascript
   // When user selects an institution
   const connector = window.TellerConnect.setup({
     applicationId: 'your-app-id',
     environment: 'sandbox',
     institution: selectedInstitution.id, // e.g., 'td_bank'
     onSuccess: (enrollment) => { ... },
   });
   
   connector.open();
   ```

## Complete Integration Example

```javascript
// 1. Load runtime configuration
async function fetchRuntimeConfig() {
  const resp = await fetch('/api/config');
  const config = await resp.json();
  return config; // { applicationId, environment, apiBaseUrl }
}

// 2. Setup Teller Connect
function setupConnect(config) {
  const connector = window.TellerConnect.setup({
    applicationId: config.applicationId,
    environment: config.environment,
    institution: 'td_bank', // Skip institution picker
    
    onSuccess: async (enrollment) => {
      // Store enrollment in localStorage
      localStorage.setItem('teller:enrollment', JSON.stringify(enrollment));
      
      // Save to backend and prime cache
      const response = await fetch('/api/enrollments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${enrollment.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enrollment }),
      });
      
      const data = await response.json();
      
      // Render accounts
      renderAccounts(data.accounts);
      
      showToast('Account connected successfully!');
    },
    
    onExit: () => {
      console.log('Teller Connect widget closed');
      showToast('Connection cancelled');
    },
    
    onEvent: (event) => {
      // Optional: Track events for analytics
      console.log('Teller event:', event);
    },
  });
  
  // 3. Connect button click handler
  const connectBtn = document.getElementById('connect-btn');
  connectBtn.addEventListener('click', () => connector.open());
}

// 4. Bootstrap
(async function() {
  const config = await fetchRuntimeConfig();
  setupConnect(config);
})();
```

## HTML Setup

Add the Teller Connect CDN before your application script:

```html
<script src="https://cdn.teller.io/connect/connect.js"></script>
<script src="./index.js" defer></script>
```

## Session Management

```javascript
// Store enrollment
function storeEnrollment(enrollment) {
  localStorage.setItem('teller:enrollment', JSON.stringify(enrollment));
}

// Retrieve enrollment on page load
function getStoredEnrollment() {
  const raw = localStorage.getItem('teller:enrollment');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Clear on disconnect
function clearEnrollment() {
  localStorage.removeItem('teller:enrollment');
}

// On page load
const enrollment = getStoredEnrollment();
if (enrollment?.accessToken) {
  // User has existing enrollment, fetch cached data
  window.__tellerAccessToken = enrollment.accessToken;
  loadCachedAccounts();
}
```

## Security Best Practices

1. **Never log access tokens**
   ```javascript
   // ❌ Don't do this
   console.log('Token:', enrollment.accessToken);
   
   // ✅ Do this
   console.log('Enrollment successful');
   ```

2. **Store tokens in memory, not in visible UI**
   ```javascript
   window.__tellerAccessToken = enrollment.accessToken;
   // Display only last 4 chars if needed
   displayToken.textContent = `...${token.slice(-4)}`;
   ```

3. **Use HTTPS in production**
   - Teller Connect requires HTTPS in production environment
   - Development can use HTTP localhost

4. **Validate on backend**
   - Don't trust client-side enrollment data
   - Verify access tokens on your backend

## Testing Recommendations

1. **Test TD Bank flow**
   - Verify institution picker is skipped
   - User goes directly to TD Bank authentication

2. **Test onExit callback**
   - Click X button → Should show "Connection cancelled" toast
   - Press Escape → Should show toast
   - Click outside modal → Should show toast

3. **Test error scenarios**
   - Invalid credentials → onExit should still fire
   - Network errors → onExit should fire

4. **Test on different browsers**
   - Chrome, Firefox, Safari
   - Mobile browsers (iOS Safari, Chrome Mobile)

## Resources

- [Teller Connect Guide](https://teller.io/docs/guides/connect)
- [Teller API Institutions](https://teller.io/docs/api/institutions)
- [Teller Webhooks](https://teller.io/docs/api/webhooks)

## Support

For issues with Teller Connect:
1. Check Teller documentation: https://teller.io/docs
2. Review this guide for common patterns
3. Test with sandbox environment first
4. Contact Teller support if integration issues persist

## Implementation Status

- ✅ **teller10-15A**: Full Teller Connect with TD Bank filtering and onExit fix
- ✅ **teller-codex10-9**: Full Teller Connect with TD Bank filtering and onExit fix  
- 📋 **teller-codex10-9-devinUI**: Visual-only demo (no backend integration)

This repository (teller-codex10-9-devinUI) is for visual design reference. See teller10-15A or teller-codex10-9 for production implementations.
