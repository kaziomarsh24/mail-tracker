/**
 * Cloudflare Worker for Personal Gmail Tracker v3.0 (Bulletproof & Audited)
 * 
 * Key Features:
 * 1. BOT & GOOGLE PROXY SCAN FILTER:
 *    Any hit within 45 seconds of sending is Google's security/pre-fetch scanner.
 *    It is recorded as DELIVERED in the timeline, NEVER as a false "Opened & Read".
 * 2. REAL HUMAN OPENS:
 *    Hits after 45 seconds trigger instant Telegram alerts with direct dashboard links.
 * 3. GLOBAL KV PERSISTENCE:
 *    Reads and writes directly via env.TRACKER_KV using parallel Promise.all fetches.
 * 4. SECURE LINK REDIRECT & CLICK TRACKING:
 *    Validates http/https URLs and debounces clicks within 8 seconds.
 */

const DEFAULT_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const DEFAULT_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID";
const DEFAULT_ADMIN_SECRET = "omar_track_sec_2026";

// 1x1 Transparent GIF (43 bytes)
const GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const GIF_BYTES = Uint8Array.from(atob(GIF_BASE64), c => c.charCodeAt(0));

const memoryStore = new Map();
let memoryIndex = [];

// Lightweight single-timestamp mute to protect KV write limits
let senderSentMutedUntil = 0;
let lastKvMuteWriteTime = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Admin-Secret",
};

function checkAdminAuth(request, url, env) {
  const secret = env?.ADMIN_SECRET || DEFAULT_ADMIN_SECRET;
  if (!secret) return true;
  const provided = request.headers.get("X-Admin-Secret") ||
                   request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
                   url.searchParams.get("key") ||
                   url.searchParams.get("secret");
  return provided === secret;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/event") {
        return await handleEvent(request, url, env, ctx);
      } else if (path === "/track") {
        return await handleTrack(request, url, env, ctx);
      } else if (path === "/click") {
        return await handleClick(request, url, env, ctx);
      } else if (path === "/api/sent-mute") {
        return await handleSentMute(request, url, env, ctx);
      } else if (path === "/api/status") {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(JSON.stringify({ error: "Unauthorized. Secret key required." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return await handleStatus(request, url, env, ctx);
      } else if (path === "/api/delete" || (path === "/api/email" && request.method === "DELETE")) {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(JSON.stringify({ error: "Unauthorized. Secret key required." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return await handleDeleteEmail(request, url, env, ctx);
      } else if (path === "/api/clear") {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(JSON.stringify({ error: "Unauthorized. Secret key required." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return await handleClearAll(request, url, env, ctx);
      } else if (path === "/dashboard") {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>401 Protected</title><style>body{background:#0b0f19;color:#f9fafb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;}div{max-width:400px;background:#111827;border:1px solid #1f2937;padding:32px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);}h2{margin-bottom:8px;color:#f87171;}p{color:#9ca3af;font-size:14px;line-height:1.5;}code{background:#1e293b;padding:2px 6px;border-radius:4px;color:#38bdf8;font-size:13px;}</style></head><body><div><h2>🔒 Protected Dashboard</h2><p>This tracking dashboard is private. Please access via the direct link in your Telegram alert or provide your key: <code>?key=YOUR_SECRET</code></p></div></body></html>`, {
            status: 401,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }
        return handleWebDashboard(request, url, env);
      } else if (path === "/" || path === "/health") {
        return new Response("Mail Tracker Worker v3.3 is Live, Secure & Operational! 🚀", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders }
        });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error("[Worker Error]", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};

// 1. /event : Register Sent Email
async function handleEvent(request, url, env, ctx) {
  let type = url.searchParams.get("type");
  let id = url.searchParams.get("id");
  let to = url.searchParams.get("to");
  let subject = url.searchParams.get("subj") || url.searchParams.get("subject");
  let sentTime = url.searchParams.get("st");

  if (request.method === "POST") {
    try {
      const body = await request.json();
      if (body.type) type = body.type;
      if (body.id) id = body.id;
      if (body.to) to = body.to;
      if (body.subj || body.subject) subject = body.subj || body.subject;
      if (body.st) sentTime = body.st;
    } catch (_) {}
  }

  if (type !== "sent" || !id) {
    return new Response(JSON.stringify({ error: "Missing required params" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const sentAt = sentTime ? parseInt(sentTime, 10) : now;

  const existing = await getEmailRecord(id, env);
  let emailRecord;
  if (existing) {
    emailRecord = {
      ...existing,
      to: (to && to !== "Unknown Recipient") ? to : (existing.to || "Unknown Recipient"),
      subject: (subject && subject !== "Important Email") ? subject : (existing.subject || "Important Email"),
      sentAt: existing.sentAt || sentAt,
    };
    if (!emailRecord.history) emailRecord.history = [];
    if (!emailRecord.history.some(h => h.event === "SENT")) {
      emailRecord.history.unshift({ event: "SENT", timestamp: sentAt, details: "Sent from Gmail" });
    }
  } else {
    emailRecord = {
      id: id,
      to: to || "Unknown Recipient",
      subject: subject || "Important Email",
      status: "SENT",
      sentAt: sentAt,
      deliveredAt: null,
      lastOpenedAt: null,
      openCount: 0,
      lastClickedAt: null,
      clicks: [],
      history: [{ event: "SENT", timestamp: sentAt, details: "Sent from Gmail" }],
    };
  }

  await saveEmailRecord(emailRecord, env);

  const alertText = [
    `🚀 <b>EMAIL SENT &amp; ARMED</b>`,
    `───────────────────────────`,
    `<b>Recipient</b> : ${escapeHtml(emailRecord.to)}`,
    `<b>Subject</b>   : ${escapeHtml(emailRecord.subject)}`,
    `<b>Time</b>      : ${formatTime(sentAt)}`,
    `<b>Tag ID</b>    : <code>${escapeHtml(emailRecord.id)}</code>`,
    `───────────────────────────`,
    `<i>Real-time tracking active</i>`,
  ].join("\n");

  ctx.waitUntil(sendTelegram(alertText, env));

  return new Response(JSON.stringify({ success: true, email: emailRecord }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 2. /track : Bot Scan vs Real Human Open
async function handleTrack(request, url, env, ctx) {
  const id = url.searchParams.get("id");
  const to = url.searchParams.get("to");
  const stParam = url.searchParams.get("st");
  const subjParam = url.searchParams.get("subj") || url.searchParams.get("subject");

  const returnPixel = () =>
    new Response(GIF_BYTES, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        ...corsHeaders,
      },
    });

  if (!id) return returnPixel();

  const userAgent = request.headers.get("user-agent") || "";
  const ip = request.headers.get("cf-connecting-ip") || "Unknown IP";
  const cf = request.cf || {};
  const country = cf.country || "Unknown Country";
  const city = cf.city || "Unknown City";
  const now = Date.now();

  let email = await getEmailRecord(id, env);
  if (!email) {
    const sentAtEstimate = stParam ? parseInt(stParam, 10) : now;
    email = {
      id: id,
      to: to || "Unknown Recipient",
      subject: subjParam || "Important Email",
      status: "SENT",
      sentAt: sentAtEstimate,
      deliveredAt: null,
      lastOpenedAt: null,
      openCount: 0,
      lastClickedAt: null,
      clicks: [],
      history: [],
    };
  } else if (subjParam && (!email.subject || email.subject === "Tracked Email" || email.subject === "(No Subject)")) {
    email.subject = subjParam;
  }

  let sentTime = email.sentAt || now;
  if (stParam) {
    const parsed = parseInt(stParam, 10);
    if (!isNaN(parsed) && parsed > 0) sentTime = parsed;
  }

  const elapsed = Math.max(0, now - sentTime);
  const isProxy = userAgent.includes("GoogleImageProxy");

  // =========================================================================
  // CRITICAL: SENDER SENT-BOX SELF-OPEN SUPPRESSION (Global & Memory Throttled)
  // If the sender has recently viewed/reloaded their Sent box, suppress pixel!
  // =========================================================================
  let isMuted = (now < senderSentMutedUntil);
  if (!isMuted && env && env.TRACKER_KV) {
    try {
      const kvMuted = await env.TRACKER_KV.get("__SENDER_MUTED_UNTIL__");
      if (kvMuted && now < parseInt(kvMuted, 10)) isMuted = true;
    } catch (_) {}
  }

  if (isMuted) {
    console.log(`[Worker] Blocked self-open: ${id} is actively being viewed in Sent box by sender.`);
    return returnPixel();
  }

  // =========================================================================
  // CRITICAL FIX 1: BOT / ANTIVIRUS SCAN & SENDER PREVIEW FILTER (< 90 SECONDS)
  // When an email is sent, Google's server pre-fetches images within 1-60s.
  // Any hit within 90 seconds is recorded as DELIVERED, NEVER as "Opened & Read".
  // =========================================================================
  if (elapsed < 90000) {
    // Only register as DELIVERED if not already delivered
    if (!email.deliveredAt) {
      email.deliveredAt = now;
      if (email.status === "SENT") email.status = "DELIVERED";
      email.history.push({ event: "DELIVERED", timestamp: now, details: "Landed in inbox (scanned by Google Proxy)" });
      await saveEmailRecord(email, env);

      // Clean delivery notification (so user knows it arrived safely, NOT that it was read!)
      const deliverAlert = [
        `⚪ <b>EMAIL DELIVERED</b>`,
        `───────────────────────────`,
        `<b>Recipient</b> : ${escapeHtml(email.to)}`,
        `<b>Subject</b>   : ${escapeHtml(email.subject)}`,
        `<b>Status</b>    : Landed in inbox (scanned by Google)`,
        `<b>Time</b>      : ${formatTime(now)} (${formatElapsed(elapsed)} after send)`,
        `<b>Tag ID</b>    : <code>${escapeHtml(email.id)}</code>`,
        `───────────────────────────`,
        `<i>Safe delivery confirmed</i>`,
      ].join("\n");

      ctx.waitUntil(sendTelegram(deliverAlert, env));
    }
    // Return pixel silently without triggering fake "Opened"
    return returnPixel();
  }

  // =========================================================================
  // CRITICAL FIX 2: REAL HUMAN OPEN
  // Deduplicate repeat opens within 120 seconds (2 minutes) to prevent reload spam
  // =========================================================================
  if (email.lastOpenedAt && (now - email.lastOpenedAt < 120000)) {
    return returnPixel();
  }

  email.openCount = (email.openCount || 0) + 1;
  email.lastOpenedAt = now;
  if (!email.deliveredAt) email.deliveredAt = now;
  if (email.status !== "CLICKED") email.status = "OPENED";

  const rawDevice = isProxy ? "Gmail App / Google Web" : userAgent.substring(0, 50);
  const friendlyDevice = parseUserAgent(userAgent, isProxy);
  const locationStr = isProxy ? `${city}, ${country} (Google Server Proxy)` : `${city}, ${country}`;

  email.history.push({ 
    event: "OPENED", 
    timestamp: now, 
    openNumber: email.openCount,
    device: friendlyDevice,
    location: locationStr
  });
  await saveEmailRecord(email, env);

  const openAlert = [
    `🟢 <b>EMAIL OPENED · ${email.openCount}x</b>`,
    `───────────────────────────`,
    `<b>Recipient</b> : ${escapeHtml(email.to)}`,
    `<b>Subject</b>   : ${escapeHtml(email.subject)}`,
    `<b>Device</b>    : ${escapeHtml(friendlyDevice)}`,
    `<b>Location</b>  : ${escapeHtml(locationStr)}`,
    `<b>Time</b>      : ${formatTime(now)} (${formatElapsed(elapsed)} after send)`,
    `<b>Tag ID</b>    : <code>${escapeHtml(email.id)}</code>`,
    `───────────────────────────`,
    `<i>Recipient is reading your message right now</i>`,
  ].join("\n");

  ctx.waitUntil(sendTelegram(openAlert, env));
  return returnPixel();
}

function isSafeRedirectUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch (_) {
    return false;
  }
}

// 3. /click : Link Tracking & 302 Redirect (Phishing-Protected)
async function handleClick(request, url, env, ctx) {
  const id = url.searchParams.get("id");
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl || !isSafeRedirectUrl(targetUrl)) {
    return new Response("Invalid or unsafe destination URL", { status: 400, headers: corsHeaders });
  }

  if (!id) {
    return new Response("Missing tracking ID", { status: 400, headers: corsHeaders });
  }

  const now = Date.now();
  let email = await getEmailRecord(id, env);
  if (!email) {
    return new Response("Unauthorized or expired tracking ID", { status: 403, headers: corsHeaders });
  }

  const userAgent = request.headers.get("user-agent") || "";
  const cf = request.cf || {};
  const country = cf.country || "Unknown Country";
  const city = cf.city || "Unknown City";
  const clickDevice = parseUserAgent(userAgent, false);
  const clickLocation = `${city}, ${country}`;

  const isRapidRepeat = email.lastClickedAt && (now - email.lastClickedAt < 8000);

  email.status = "CLICKED";
  email.lastClickedAt = now;
  email.clicks = email.clicks || [];
  email.clicks.push({ url: targetUrl, timestamp: now, device: clickDevice, location: clickLocation });
  email.history.push({ event: "CLICKED", url: targetUrl, timestamp: now, device: clickDevice, location: clickLocation });
  await saveEmailRecord(email, env);

  if (!isRapidRepeat) {
    const clickAlert = [
      `⚡ <b>LINK CLICKED IN EMAIL</b>`,
      `───────────────────────────`,
      `<b>Recipient</b> : ${escapeHtml(email.to)}`,
      `<b>Subject</b>   : ${escapeHtml(email.subject)}`,
      `<b>URL</b>       : <code>${escapeHtml(targetUrl)}</code>`,
      `<b>Device</b>    : ${escapeHtml(clickDevice)}`,
      `<b>Location</b>  : ${escapeHtml(clickLocation)}`,
      `<b>Time</b>      : ${formatTime(now)}`,
      `<b>Tag ID</b>    : <code>${escapeHtml(email.id)}</code>`,
      `───────────────────────────`,
      `<i>High-intent engagement detected</i>`,
    ].join("\n");

    ctx.waitUntil(sendTelegram(clickAlert, env));
  }

  return Response.redirect(targetUrl, 302);
}

// 4. /api/status : Live JSON API for Extension UI
async function handleStatus(request, url, env, ctx) {
  const id = url.searchParams.get("id");
  if (id) {
    const email = await getEmailRecord(id, env);
    return new Response(JSON.stringify({ success: true, email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const emails = await getAllEmails(env);
  return new Response(JSON.stringify({ success: true, total: emails.length, emails }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 5. /api/delete : Delete single email from KV & memory
async function handleDeleteEmail(request, url, env, ctx) {
  cachedStatusList = null;
  let id = url.searchParams.get("id");
  if (request.method === "POST" || request.method === "DELETE") {
    try {
      const body = await request.json();
      if (body && body.id) id = body.id;
    } catch (_) {}
  }

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing email id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  memoryStore.delete(id);
  memoryIndex = memoryIndex.filter((k) => k !== id);

  if (env && env.TRACKER_KV) {
    try {
      await env.TRACKER_KV.delete(id);
      const storedIndex = await env.TRACKER_KV.get("__INDEX__", "json");
      if (Array.isArray(storedIndex)) {
        const newIndex = storedIndex.filter((k) => k !== id);
        await env.TRACKER_KV.put("__INDEX__", JSON.stringify(newIndex));
      }
    } catch (e) {
      console.error("[KV Delete Error]", e);
    }
  }

  return new Response(JSON.stringify({ success: true, deletedId: id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 6. /api/clear : Clear all test data from KV & memory (Paginated Cursor)
async function handleClearAll(request, url, env, ctx) {
  cachedStatusList = null;
  memoryStore.clear();
  memoryIndex = [];

  if (env && env.TRACKER_KV) {
    try {
      let cursor = undefined;
      do {
        const list = await env.TRACKER_KV.list({ limit: 100, cursor });
        if (list && list.keys) {
          for (const k of list.keys) {
            await env.TRACKER_KV.delete(k.name);
          }
        }
        cursor = list.list_complete ? undefined : list.cursor;
      } while (cursor);
      await env.TRACKER_KV.put("__INDEX__", JSON.stringify([]));
    } catch (e) {
      console.error("[KV Clear Error]", e);
    }
  }

  return new Response(JSON.stringify({ success: true, cleared: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 7. /api/sent-mute : Mute tracking for emails currently being viewed by sender (Zero Quota Waste)
async function handleSentMute(request, url, env, ctx) {
  const now = Date.now();
  senderSentMutedUntil = now + 45000; // Mute for 45s in memory

  // Throttled: Write to KV at most once per minute (prevents burning KV write quota)
  if (env && env.TRACKER_KV && (now - lastKvMuteWriteTime > 60000)) {
    lastKvMuteWriteTime = now;
    ctx.waitUntil(env.TRACKER_KV.put("__SENDER_MUTED_UNTIL__", String(now + 60000), { expirationTtl: 120 }).catch(() => {}));
  }

  return new Response(JSON.stringify({ success: true, mutedUntil: senderSentMutedUntil }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 8. /dashboard : Standalone Mobile & Web Dashboard
function handleWebDashboard(request, url, env) {
  const origin = url.origin;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MailTracker Live Dashboard</title>
  <style>
    :root {
      --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc;
      --text-muted: #94a3b8; --primary: #38bdf8; --delivered: #2dd4bf;
      --opened: #4ade80; --clicked: #c084fc; --danger: #ef4444;
    }
    * { box-sizing: border-box; margin:0; padding:0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 16px; flex-wrap: wrap; gap: 10px; }
    .brand { font-size: 20px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; background: #0284c7; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 14px; text-align: center; }
    .kpi-val { font-size: 26px; font-weight: 800; }
    .kpi-lbl { font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-top: 4px; }
    .table-box { 
      background: var(--card); 
      border: 1px solid var(--border); 
      border-radius: 10px; 
      overflow-x: auto; 
      -webkit-overflow-scrolling: touch;
      width: 100%;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    }
    table { 
      width: 100%; 
      min-width: 620px; /* Ensures clean horizontal scrolling on all mobile screens */
      border-collapse: collapse; 
      text-align: left; 
      font-size: 13px; 
    }
    th { background: #0f172a; padding: 12px 14px; color: var(--text-muted); font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--border); white-space: nowrap; }
    td { padding: 12px 14px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    td:nth-child(2) { white-space: normal; min-width: 160px; }
    tr:hover td { background: #243248; cursor: pointer; }
    .btn { background: #334155; border: 1px solid var(--border); color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
    .btn:hover { background: #475569; }
    .btn-danger { color: #fca5a5; border-color: #7f1d1d; }
    .btn-danger:hover { background: #7f1d1d; }
    .tag { padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .tag-sent { background: #334155; color: #cbd5e1; }
    .tag-deliv { background: #042f2e; color: #2dd4bf; }
    .tag-open { background: #052e16; color: #4ade80; }
    .tag-click { background: #3b0764; color: #c084fc; }
    .timeline { padding: 12px; background: #131d2e; border-left: 2px solid var(--primary); font-size: 12px; line-height: 1.6; white-space: normal; }
    .del-btn { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.7; }
    .del-btn:hover { opacity: 1; transform: scale(1.1); }
    .scroll-hint { display: none; }
    @media (max-width: 640px) {
      body { padding: 12px 8px; }
      .brand { font-size: 17px; }
      .header { gap: 8px; margin-bottom: 14px; padding-bottom: 12px; }
      .kpis { grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
      .kpi { padding: 10px; }
      .kpi-val { font-size: 20px; }
      .scroll-hint {
        display: block;
        font-size: 11px;
        color: var(--primary);
        text-align: right;
        margin-bottom: 6px;
        opacity: 0.85;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">📨 MailTracker <span class="badge">LIVE</span></div>
      <div>
        <button class="btn" onclick="fetchData()">🔄 Refresh</button>
        <button class="btn btn-danger" onclick="clearAllData()">🗑️ Clear Test Data</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-val" style="color:#94a3b8" id="kSent">0</div><div class="kpi-lbl">Total Sent</div></div>
      <div class="kpi"><div class="kpi-val" style="color:var(--delivered)" id="kDeliv">0</div><div class="kpi-lbl">Delivered</div></div>
      <div class="kpi"><div class="kpi-val" style="color:var(--opened)" id="kOpen">0</div><div class="kpi-lbl">Opened</div></div>
      <div class="kpi"><div class="kpi-val" style="color:var(--clicked)" id="kClick">0</div><div class="kpi-lbl">Clicked</div></div>
    </div>
    <div class="scroll-hint">👉 Swipe table to view all columns</div>
    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Opens</th>
            <th>Sent At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="mailRows">
          <tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">Loading live tracking data...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <script>
    let emails = [];
    const openSet = new Set();
    const urlParams = new URLSearchParams(window.location.search);
    const authKey = urlParams.get('key') || urlParams.get('secret') || '';

    async function fetchData() {
      try {
        const res = await fetch('/api/status?key=' + encodeURIComponent(authKey));
        const data = await res.json();
        emails = data.emails || [];
        render();
      } catch(e) {
        console.error(e);
      }
    }
    async function deleteEmail(id) {
      if (!confirm('Delete this email record from Cloudflare KV?')) return;
      try {
        await fetch('/api/delete?id=' + encodeURIComponent(id) + '&key=' + encodeURIComponent(authKey), { method: 'POST' });
        openSet.delete(id);
        fetchData();
      } catch(err) { alert('Delete failed: ' + err.message); }
    }
    async function clearAllData() {
      if (!confirm('Are you sure you want to delete ALL test emails? This cannot be undone.')) return;
      try {
        await fetch('/api/clear?key=' + encodeURIComponent(authKey), { method: 'POST' });
        openSet.clear();
        fetchData();
      } catch(err) { alert('Clear failed: ' + err.message); }
    }
    function esc(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function render() {
      let sent = emails.length, deliv = 0, opened = 0, clicked = 0;
      emails.forEach(m => {
        const s = (m.status || 'SENT').toUpperCase();
        if (s === 'CLICKED') clicked++;
        else if (s === 'OPENED' || (m.openCount > 0)) opened++;
        else if (s === 'DELIVERED') deliv++;
      });
      document.getElementById('kSent').textContent = sent;
      document.getElementById('kDeliv').textContent = deliv;
      document.getElementById('kOpen').textContent = opened;
      document.getElementById('kClick').textContent = clicked;

      const tb = document.getElementById('mailRows');
      if (emails.length === 0) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">No emails tracked yet.</td></tr>';
        return;
      }
      tb.innerHTML = '';
      emails.forEach(m => {
        const s = (m.status || 'SENT').toUpperCase();
        let tag = '<span class="tag tag-sent">🚀 Sent</span>';
        if (s === 'CLICKED') tag = '<span class="tag tag-click">🎯 Clicked</span>';
        else if (s === 'OPENED' || m.openCount > 0) tag = '<span class="tag tag-open">👀 Opened (' + (m.openCount || 1) + 'x)</span>';
        else if (s === 'DELIVERED') tag = '<span class="tag tag-deliv">📥 Delivered</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = '<td><b>' + esc(m.to||'N/A') + '</b></td><td>' + esc(m.subject||'(No Subject)') + '</td><td>' + tag + '</td><td><b>' + (m.openCount||0) + 'x</b></td><td>' + (m.sentAt ? new Date(m.sentAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—') + '</td><td><button class="del-btn" data-id="' + esc(m.id) + '" title="Delete Record">🗑️</button></td>';
        
        const detailTr = document.createElement('tr');
        detailTr.style.display = openSet.has(m.id) ? 'table-row' : 'none';
        const hist = m.history || [];
        let histHtml = '';
        if (hist.length > 0) {
          histHtml = hist.map(h => {
            let meta = '';
            if (h.device) meta += ' — ' + esc(h.device);
            if (h.location) meta += ' (' + esc(h.location) + ')';
            if (h.details) meta += ' ' + esc(h.details);
            if (h.url) meta += ' [' + esc(h.url) + ']';
            return '<div>• <b>' + esc(h.event) + '</b> (' + new Date(h.timestamp).toLocaleTimeString() + ')' + meta + '</div>';
          }).join('');
        } else {
          histHtml = '<div>• SENT to ' + esc(m.to) + '</div>' + (m.lastOpenedAt ? '<div>• OPENED at ' + new Date(m.lastOpenedAt).toLocaleTimeString() + '</div>' : '');
        }
        detailTr.innerHTML = '<td colspan="6"><div class="timeline"><div style="font-weight:600; margin-bottom:4px; color:var(--primary);">Event Timeline (ID: ' + esc(m.id) + '):</div>' + histHtml + '</div></td>';

        tr.onclick = (e) => {
          if (e.target.closest('.del-btn')) return;
          const isShow = detailTr.style.display === 'none';
          detailTr.style.display = isShow ? 'table-row' : 'none';
          if (isShow) openSet.add(m.id); else openSet.delete(m.id);
        };

        tb.appendChild(tr);
        tb.appendChild(detailTr);
      });

      tb.onclick = (e) => {
        const btn = e.target.closest('.del-btn');
        if (btn && btn.dataset.id) {
          e.stopPropagation();
          deleteEmail(btn.dataset.id);
        }
      };
    }
    fetchData();
    setInterval(fetchData, 10000);
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

// =========================================================================
// GLOBAL STORAGE: Direct Cloudflare KV Binding (env.TRACKER_KV)
// =========================================================================
// In-memory cache for status to preserve Cloudflare KV Free tier quota
let cachedStatusList = null;
let lastStatusCacheTime = 0;

async function saveEmailRecord(record, env) {
  cachedStatusList = null; // invalidate cache
  memoryStore.set(record.id, record);

  if (env && env.TRACKER_KV) {
    try {
      await env.TRACKER_KV.put(record.id, JSON.stringify(record));
      
      // Fetch existing global index from KV to avoid overwriting across isolates
      let index = await env.TRACKER_KV.get("__INDEX__", "json");
      if (!Array.isArray(index)) index = [];
      
      if (!index.includes(record.id)) {
        index.unshift(record.id);
        if (index.length > 100) index = index.slice(0, 100);
        await env.TRACKER_KV.put("__INDEX__", JSON.stringify(index));
      }
    } catch (e) {
      console.error("[KV Put Error]", e);
    }
  } else {
    if (!memoryIndex.includes(record.id)) {
      memoryIndex.unshift(record.id);
      if (memoryIndex.length > 50) memoryIndex.pop();
    }
  }
}

async function getEmailRecord(id, env) {
  if (env && env.TRACKER_KV) {
    try {
      const data = await env.TRACKER_KV.get(id, "json");
      if (data) {
        memoryStore.set(id, data);
        return data;
      }
    } catch (_) {}
  }
  return memoryStore.get(id) || null;
}

async function getAllEmails(env) {
  const now = Date.now();
  // 1. Serve from in-memory cache if requested within 10 seconds (Zero KV operations!)
  if (cachedStatusList && (now - lastStatusCacheTime < 10000)) {
    return cachedStatusList;
  }

  // 2. Read from Cloudflare KV using __INDEX__ (Zero LIST operations!)
  if (env && env.TRACKER_KV) {
    try {
      const storedIndex = await env.TRACKER_KV.get("__INDEX__", "json");
      if (Array.isArray(storedIndex)) {
        if (storedIndex.length === 0) {
          cachedStatusList = [];
          lastStatusCacheTime = now;
          return [];
        }
        const records = await Promise.all(
          storedIndex.map((id) => env.TRACKER_KV.get(id, "json"))
        );
        const emails = records.filter((rec) => rec && rec.id);
        cachedStatusList = emails;
        lastStatusCacheTime = now;
        return emails;
      }
    } catch (e) {
      console.error("[KV Read Error]", e);
    }
  }

  // Memory fallback
  const result = [];
  for (const id of memoryIndex) {
    const item = memoryStore.get(id);
    if (item) result.push(item);
  }
  cachedStatusList = result;
  lastStatusCacheTime = now;
  return result;
}

async function sendTelegram(text, env, customUrl = null) {
  const token = env?.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  const chatId = env?.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;
  const adminSecret = env?.ADMIN_SECRET || DEFAULT_ADMIN_SECRET;
  const dashBase = customUrl || env?.DASHBOARD_URL || "https://t.snapclip.tech/dashboard";
  const dashUrl = dashBase.includes("?") ? `${dashBase}&key=${adminSecret}` : `${dashBase}?key=${adminSecret}`;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📊 Open Live Dashboard", url: dashUrl }
        ]
      ]
    }
  };

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Telegram send error:", err);
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleString("en-US", { timeZone: "Asia/Dhaka", dateStyle: "short", timeStyle: "medium" });
}

function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseUserAgent(ua, isProxy) {
  if (isProxy) return "Gmail App / Google Proxy";
  if (!ua) return "Unknown Device";

  // Operating System / Device Type
  let os = "Desktop";

  if (/iphone/i.test(ua)) {
    os = "iPhone";
  } else if (/ipad/i.test(ua)) {
    os = "iPad";
  } else if (/android/i.test(ua)) {
    os = "Android";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "Mac";
  } else if (/windows nt/i.test(ua)) {
    os = "Windows PC";
  } else if (/linux/i.test(ua)) {
    os = "Linux PC";
  }

  // Browser / Email Client
  let client = "";
  if (/thunderbird/i.test(ua)) {
    client = "Thunderbird Mail";
  } else if (/outlook/i.test(ua)) {
    client = "Outlook";
  } else if (/edg\//i.test(ua)) {
    client = "Edge";
  } else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) {
    client = "Chrome";
  } else if (/firefox|fxios|rv:\d+/i.test(ua)) {
    client = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    client = "Safari / Apple Mail";
  }

  return `${os}${client ? ` (${client})` : ""}`;
}
