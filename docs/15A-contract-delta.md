# Teller 15A API contract vs visual adapter

This note captures the current 15A backend contract (from `teller10-15A`) and how it lines up with the visual-only adapter in `visual-only/index.js`. Use it to update the adapter without having to keep re-checking the backend.

## Shared requirements
- **Authorization is mandatory** for every `/api/db/...` and `/api/accounts/...` call. Each route authenticates by parsing the `Authorization: Bearer <token>` header and rejects requests without it.【F:backend-15A/python/resources.py†L61-L191】【F:backend-15A/python/resources.py†L318-L372】 The adapter only adds this header when `window.TEST_BEARER_TOKEN` (or an injected `state.bearerToken`) is present, so integration must ensure a valid access token is injected before enabling the backend.【F:visual-only/index.js†L34-L118】
- **Headers/content types.** JSON responses are emitted automatically; the backend does not require an `Accept` header. `Content-Type: application/json` is required only for the manual data `PUT` body, which the adapter already sets.【F:backend-15A/python/resources.py†L333-L372】【F:visual-only/index.js†L107-L119】
- **Feature flags surfaced by config.** `GET /api/config` now returns both `FEATURE_USE_BACKEND` and `FEATURE_MANUAL_DATA`. The adapter currently reads only the backend flag; consider wiring the manual-data flag before shipping so the UI can hide the manual panel when the backend disables it.【F:backend-15A/python/teller.py†L140-L149】【F:visual-only/index.js†L15-L33】

## Endpoint-by-endpoint comparison

### `GET /api/config`
- **Backend response:** `{ applicationId, environment, apiBaseUrl, FEATURE_MANUAL_DATA, FEATURE_USE_BACKEND }` derived from startup arguments and env vars.【F:backend-15A/python/teller.py†L140-L149】
- **Example:**
  ```json
  {
    "applicationId": "app_example",
    "environment": "development",
    "apiBaseUrl": "/api",
    "FEATURE_MANUAL_DATA": true,
    "FEATURE_USE_BACKEND": false
  }
  ```
- **Adapter expectation:** fetches `/api/config`, updates its local `apiBaseUrl`, and toggles only `FEATURE_USE_BACKEND` today.【F:visual-only/index.js†L15-L33】 Delta: add handling for `FEATURE_MANUAL_DATA` if the UI should suppress manual data when the flag is false.

### `GET ${apiBaseUrl}/db/accounts`
- **Backend response:** `{ "accounts": [ { id, name, institution, last_four, type, subtype, currency } ] }` via `serialize_account`.【F:backend-15A/python/resources.py†L172-L192】【F:backend-15A/python/resources.py†L303-L312】
- **Example:**
  ```json
  {
    "accounts": [
      {
        "id": "acc_123",
        "name": "Operating Checking",
        "institution": "us_bank",
        "last_four": "1234",
        "type": "depository",
        "subtype": "checking",
        "currency": "USD"
      }
    ]
  }
  ```
- **Adapter expectation:** issues `GET ${state.apiBaseUrl}/db/accounts` with the bearer token, then maps only the fields it needs.【F:visual-only/index.js†L41-L53】 No path differences; just ensure the token header is present.

### `GET ${apiBaseUrl}/db/accounts/{accountId}/balances`
- **Backend response:** `{ "account_id": ..., "cached_at": <ISO timestamp>, "balance": <Teller balance JSON> }`. Returns 404 when the cached balance is missing.【F:backend-15A/python/resources.py†L195-L218】
- **Adapter expectation:** merges `balance` and `cached_at` into the card model, falling back to mock data on failure.【F:visual-only/index.js†L55-L65】 Contracts match.

### `GET ${apiBaseUrl}/db/accounts/{accountId}/transactions?limit={n}`
- **Backend response:** `{ "account_id": ..., "transactions": [...], "cached_at": <timestamp|null> }` with `limit` coerced to the 1–100 range.【F:backend-15A/python/resources.py†L220-L239】
- **Adapter expectation:** always asks for `limit=10` and only consumes the `transactions` array, ignoring `cached_at`.【F:visual-only/index.js†L67-L78】 Contracts match; make sure callers stay within the supported limit range.

### `GET ${apiBaseUrl}/db/accounts/{accountId}/manual-data`
- **Backend response:** Returns `{ "account_id": ..., "rent_roll": <number|null>, "updated_at": <ISO timestamp|null> }`, defaulting to nulls when no record exists.【F:backend-15A/python/repository.py†L160-L204】【F:backend-15A/python/resources.py†L315-L332】
- **Example:**
  ```json
  {
    "account_id": "acc_123",
    "rent_roll": 2500.0,
    "updated_at": "2025-10-18T03:41:22.105Z"
  }
  ```
- **Adapter expectation:** treats non-200 as "no data" and renders the amount/timestamp when provided.【F:visual-only/index.js†L96-L105】【F:visual-only/index.js†L263-L279】 Contracts align as long as the backend keeps snake_case keys.

### `PUT ${apiBaseUrl}/db/accounts/{accountId}/manual-data`
- **Backend request:** JSON body `{ "rent_roll": <number|null> }`. Values are coerced to two decimal places; negatives trigger `400 invalid-rent-roll`.【F:backend-15A/python/repository.py†L176-L204】【F:backend-15A/tests/test_manual_data.py†L36-L179】
- **Backend response:** same shape as the `GET`, with `rent_roll` normalized and `updated_at` refreshed.【F:backend-15A/python/resources.py†L333-L372】
- **Adapter expectation:** sends `{ rent_roll }` with `Content-Type: application/json` and surfaces any error descriptions in the toast.【F:visual-only/index.js†L107-L119】 Paths and payload keys are already aligned.

### Live refresh endpoints (unchanged)
The live Teller passthrough routes remain `/api/accounts/{id}/balances` and `/api/accounts/{id}/transactions?count=n`. The adapter still calls these in parallel from `refreshLive`. Keep the bearer token in place so these calls succeed when live refresh is enabled.【F:backend-15A/python/teller.py†L268-L275】【F:visual-only/index.js†L80-L94】

## Action items for adapter alignment
1. Ensure a real Teller access token is injected into `window.TEST_BEARER_TOKEN` (or similar) before flipping `FEATURE_USE_BACKEND`, otherwise every secured route will return 401.【F:backend-15A/python/resources.py†L61-L192】【F:visual-only/index.js†L34-L118】
2. Read `FEATURE_MANUAL_DATA` from `/api/config` so the manual panel can be toggled off when the backend disables it.【F:backend-15A/python/teller.py†L140-L149】【F:visual-only/index.js†L15-L33】
3. Leave manual data payloads in snake_case and keep requests under the documented limits; no other deltas were found between the backend and adapter paths.【F:backend-15A/python/resources.py†L303-L372】【F:visual-only/index.js†L41-L119】
