# Deployment Choices

Goal
- Serve devinUI with the backend to avoid CORS and allow runtime control via /api/config.

Option A: Same-origin (recommended)
- Serve static UI assets under the backend’s origin.
- Pros: No CORS, relative /api paths work, simplest ops and rollout.
- Config: /api/config returns { apiBaseUrl: "/api", FEATURE_USE_BACKEND?: boolean }.
- Rollback: Set FEATURE_USE_BACKEND=false in /api/config.

Option B: Separate static hosting behind reverse proxy
- Use a proxy to present both UI and backend on the same origin.
- Pros: Independent deploys; same-origin preserved via proxy.
- Cons: Proxy config complexity.
- Rollback: Same as Option A.

Notes
- Do not expose absolute cross-origin API URLs in the UI; prefer relative paths and let /api/config govern apiBaseUrl and feature flag.
- FEATURE_USE_BACKEND in /api/config is additive and optional; UI defaults to false.

## Incident fallback: force mock mode

If the backend becomes unhealthy or you need to cut traffic quickly, force the UI into mock-only mode:

1. Update the `/api/config` response to omit or set `FEATURE_USE_BACKEND` to `false`:
   ```json
   {
     "apiBaseUrl": "/api",
     "FEATURE_USE_BACKEND": false
   }
   ```
2. Invalidate any CDN caches for `/api/config` so clients pick up the change immediately.
3. Optional: restart the backend with the flag hard-coded to `false` (or remove the field) to keep the fallback in place during the incident.
4. Verify from a browser by reloading the dashboard and confirming no requests to `/api/db/*` are issued (see Validation Scenario 2b).

With the flag disabled, all fetchers return the built-in mock datasets (`MOCK_ACCOUNTS`, `MOCK_BALANCES`, `MOCK_TRANSACTIONS`) and manual data defaults, ensuring the UI stays usable while backend issues are resolved.
