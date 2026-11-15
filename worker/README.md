# 📬 Cloudflare Worker - Personal Gmail Tracker

High-performance, edge-deployed Cloudflare Worker powering Telegram notifications and Gmail engagement analytics.

## 🌟 Features

1. **Four Event Types with Rich HTML Telegram Alerts**:
   - 🚀 **[Sent & Registered]**: `/event?type=sent&id=...&to=...&subj=...`
   - 📥 **[Delivered to Inbox]**: `/track?id=...&st=...` (1st proxy scan detected within 30s of send)
   - 👀 **[Opened & Read]**: `/track?id=...` (Genuine recipient open with tracked open count `1x, 2x, ...`)
   - 🎯 **[Link Clicked]**: `/click?id=...&url=...` (Instant Telegram alert + HTTP 302 redirect)
2. **🛡️ Smart Self-Open Prevention**:
   - Hits within 7 seconds from the sender's own non-proxy browser (e.g., Gmail displaying the sent email immediately after sending) are silently ignored.
3. **⚡ Production-Grade Hybrid Persistence**:
   - Edge L1 In-Memory Map.
   - Cloudflare Cache API (`caches.default`) for multi-day persistence across edge nodes without requiring paid KV.
   - Cloudflare KV binding support (`env.TRACKER_KV`) if configured.
4. **📊 Live Extension API (`/api/status`)**:
   - Query individual email status or live list of all tracked emails for the Chrome Extension Popup UI.
   - Full CORS preflight and headers enabled.

---

## 🛠️ API Endpoints

### 1. `GET /event` or `POST /event`
Registers a newly sent email and triggers the 🚀 Sent Telegram alert.

**Query Parameters (or JSON body):**
- `type`: `sent`
- `id`: Unique email tracking ID (e.g. `mail_xyz123`)
- `to`: Recipient email(s)
- `subj`: Email subject
- `st`: (Optional) Epoch timestamp in milliseconds

**Response:**
```json
{
  "success": true,
  "message": "Email registered successfully",
  "email": {
    "id": "mail_xyz123",
    "to": "client@example.com",
    "subject": "Proposal Discussion",
    "status": "SENT",
    "sentAt": 1700000000000,
    "openCount": 0,
    "clicks": []
  }
}
```

---

### 2. `GET /track`
Returns a 43-byte transparent 1x1 GIF (`image/gif`) with zero caching headers.

**Query Parameters:**
- `id`: Tracking ID (or `test-from-extension` for testing)
- `to`: (Optional) Recipient email
- `st`: (Optional) Epoch timestamp when email was sent

**Event Detection Logic:**
- **Self-Open Check**: If hit occurs within 7s of send and User-Agent is NOT a known mail proxy (e.g., `GoogleImageProxy`), it is ignored silently.
- **📥 Delivered**: If it is the first scan within 30s of send or from a mail server image proxy, it marks status as `DELIVERED` and notifies Telegram.
- **👀 Opened**: Hits occurring after 30s or subsequent opens increment `openCount` and notify Telegram with recipient device, location, and open count.

---

### 3. `GET /click`
Tracks link engagement and redirects the user to the destination.

**Query Parameters:**
- `id`: Tracking ID
- `url`: Destination URL (e.g., `https://myportfolio.com`)
- `to`: (Optional) Recipient email

**Behavior:**
- Records click timestamp, user agent, IP, and destination URL.
- Sends 🎯 **Link Clicked** Telegram alert.
- Returns HTTP 302 Found redirect to destination URL.

---

### 4. `GET /api/status`
Returns live tracking data for the Chrome Extension Popup.

**Query Parameters:**
- `id`: (Optional) Retrieve a specific email record. Omit to retrieve all recent tracked emails.

**Sample Response:**
```json
{
  "success": true,
  "total": 1,
  "emails": [
    {
      "id": "mail_xyz123",
      "to": "client@example.com",
      "subject": "Proposal Discussion",
      "status": "OPENED",
      "sentAt": 1700000000000,
      "deliveredAt": 1700000015000,
      "lastOpenedAt": 1700000300000,
      "openCount": 2,
      "lastClickedAt": 1700000350000,
      "clicks": [
        {
          "url": "https://example.com/demo",
          "timestamp": 1700000350000,
          "device": "Chrome (macOS)"
        }
      ]
    }
  ]
}
```

---

## 🚀 Deployment Instructions

### Option A: Cloudflare Dashboard (Quick & Easy)
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages**.
2. Click **Create Application** > **Create Worker**.
3. Name your worker (e.g., `mailtracker`).
4. Click **Deploy**.
5. Click **Edit code**, replace the contents of `worker.js` with the code in `index.js`, and click **Deploy**.
6. (Optional) Go to **Settings** > **Variables and Secrets** to add:
   - `TELEGRAM_BOT_TOKEN`: `9257112796:AAFfo9I4EPJ545F2cbgbYl3DIKG5P2gmips`
   - `TELEGRAM_CHAT_ID`: `7191826750`

### Option B: Wrangler CLI
```bash
cd /Users/kaziomar/.gemini/antigravity/scratch/gmail-mail-tracker/worker
npx wrangler deploy
```

---

## 🧪 Running Tests

A full automated test suite is included to verify all 8 scenarios:
```bash
node test-worker.mjs
```
