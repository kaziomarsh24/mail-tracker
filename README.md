# Personal Gmail Mail Tracker & Real-Time Alert System

> A 100% free, private, watermark-free personal email tracking system for Gmail with instant Telegram alerts, in-line Gmail thread checkmarks, compose toggles, and live analytics dashboard.

---

## 🌟 Key Features

1. **Watermark-Free & Invisible:**
   - 1x1 transparent tracking pixel embedded into outgoing emails.
   - Clean URLs (link tracking can be toggled on/off per compose window).
2. **Instant Real-Time Telegram Alerts:**
   - Email Sent & Armed notification.
   - 📥 Email Delivered to Inbox notification (scanned upon delivery by Google Proxy).
   - 👀 Real Human Open & Read alert with count, elapsed time, device, and location.
   - 🎯 Link Clicked alert with debouncing and safe URL validation.
   - Quick one-tap inline keyboard button `[ 📊 Open Live Dashboard ]`.
3. **In-Line Gmail Thread Badges:**
   - Shows checkmarks on Gmail rows in Sent and Inbox:
     - `✓` Gray: Sent & Armed
     - `✓✓` Blue: Delivered to Inbox
     - `✓✓ 1x / 2x` Green: Opened & Read with open counter
     - `✓✓ 🔗` Purple: Link Clicked
4. **Sent-Box Self-Open Suppression:**
   - Multi-tier defense so opening your own Sent folder never falsely triggers an open.
5. **Zero KV Cost & Quota Protection:**
   - 10-second in-memory RAM caching on Worker.
   - Elimination of expensive `KV.list()` operations to stay well within Cloudflare Free tier.

---

## 📁 Repository Structure

```
.
├── manifest.json         # Chrome MV3 Extension Manifest
├── content.js            # Gmail DOM Controller & Compose UI Injector
├── popup.html / popup.js # Extension Toolbar Popup Controller
├── dashboard.html / .js  # Full-screen Dashboard UI
├── icons/                # Extension Icons (16x16, 48x48, 128x128)
└── worker/
    ├── index.js          # Cloudflare Worker API & 1x1 Pixel Server
    ├── wrangler.toml     # Cloudflare Worker configuration & KV bindings
    └── package.json      # Worker dev dependencies
```

---

## 🚀 Setup & Deployment

### 1. Cloudflare Worker Deployment
1. Navigate to `worker/`:
   ```bash
   cd worker
   npm install
   ```
2. Configure `wrangler.toml` with your Cloudflare KV namespace:
   ```bash
   npx wrangler kv:namespace create TRACKER_KV
   ```
3. Set your Telegram Bot Token & Chat ID as secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```
4. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

### 2. Chrome Extension Setup
1. Open Google Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the root directory of this repository.
4. Refresh Gmail (`https://mail.google.com`).
