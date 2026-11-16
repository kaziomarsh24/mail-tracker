# Cloudflare Worker - Personal Gmail Tracker (Modular v3.5)

Clean, modular, edge-deployed Cloudflare Worker powering Telegram notifications and Gmail engagement analytics.

---

## Architecture Overview

The codebase is organized into clean, single-responsibility ES modules:

```text
worker/
├── src/
│   ├── index.js             # Minimal router & entrypoint (~70 lines)
│   ├── config.js            # Global defaults & constants
│   ├── routes/
│   │   ├── event.js         # /event - Registers newly sent emails
│   │   ├── track.js         # /track - 1x1 GIF, bot pre-scan filter, human opens
│   │   ├── click.js         # /click - Phishing-protected link redirection & click alert
│   │   ├── status.js        # /api/status, /api/delete, /api/clear, /api/sent-mute
│   │   └── dashboard.js     # /dashboard - Protected web dashboard
│   ├── storage/
│   │   └── kv.js            # Global KV persistence & in-memory cache
│   ├── services/
│   │   ├── telegram.js      # Clean Telegram HTML alert builder & dispatcher
│   │   └── device.js        # Clean OS & Browser detector (zero emoji clutter)
│   ├── views/
│   │   └── dashboardHtml.js # Responsive web dashboard with Lucide vector SVGs
│   └── utils/
│       ├── security.js      # Secret key auth, CORS, URL validator, HTML escape
│       └── time.js          # Localized time formatting (Asia/Dhaka) & elapsed time
├── wrangler.toml            # Configured to point to src/index.js
├── package.json             # Scripts for dev, test, and deploy
└── test-worker.mjs          # Automated end-to-end test suite (8 tests)
```

---

## Automated Deployment (CI/CD via GitHub Actions)

Every push to `main` automatically runs tests and deploys this worker to Cloudflare via `.github/workflows/deploy-worker.yml`.

### Required GitHub Secrets:
Go to your GitHub repository **Settings -> Secrets and variables -> Actions** and add:
1. `CLOUDFLARE_API_TOKEN`: Your Cloudflare API Token (Permissions: `Account.Workers Scripts: Edit`).
2. `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (found on the Workers Overview page).

---

## Local Testing & Development

Run the full automated test suite locally:
```bash
cd worker
npm test
```
Outputs:
```text
=== Testing Cloudflare Worker ===
Test 1: OPTIONS CORS Preflight               ✓ Passed
Test 2: Register Email Sent via /event        ✓ Passed
Test 3: Self-Open Prevention                  ✓ Passed
Test 4: Delivered to Inbox (Google scan)      ✓ Passed
Test 5: Opened & Read (Real human open)       ✓ Passed
Test 6: Repeat Open Deduplication             ✓ Passed
Test 7: /click Link Tracking & Redirect       ✓ Passed
Test 8: /api/status returning emails          ✓ Passed

ALL WORKER TESTS PASSED SUCCESSFULLY!
```

---

## Core Security & Reliability Guarantees

1. **Zero Watermark / 100% Free Tier:** Operates within Cloudflare's free limits with zero cost.
2. **Bot & Scanner Suppression:** Differentiates Google image pre-fetches (<90s) from real recipient opens.
3. **Sent Box Self-Open Protection:** In-memory + throttled KV mute prevents false alarms when sender views sent emails.
4. **Secret Key Authentication:** `/dashboard` and `/api/*` endpoints require `?key=YOUR_SECRET` or `X-Admin-Secret` header.
5. **No Open Redirect:** Destination URLs must match a tracked email record before redirection.
