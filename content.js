// Personal Gmail Tracker - Content Script v2.5
const DEFAULT_WORKER_URL = "https://mailtracker.softeng-kaziomar.workers.dev";
const CUSTOM_DOMAIN_URL = "https://t.snapclip.tech";
const DEFAULT_ADMIN_SECRET = "omar_track_sec_2026";

let isTrackingEnabled = true;
let isLinkTrackingEnabled = true;
let workerUrl = DEFAULT_WORKER_URL;

function isContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

function safeStorageGet(keys, callback) {
  if (!isContextValid()) return;
  try {
    chrome.storage.local.get(keys, callback);
  } catch (err) {
    console.warn("[Mail Tracker] Storage get skipped:", err.message);
  }
}

function safeStorageSet(data, callback) {
  if (!isContextValid()) return;
  try {
    chrome.storage.local.set(data, callback);
  } catch (err) {
    console.warn("[Mail Tracker] Storage set skipped:", err.message);
  }
}

let cachedTrackedMails = [];

safeStorageGet(["isTrackingEnabled", "isLinkTrackingEnabled", "workerUrl", "sentMails"], (res) => {
  if (res?.isTrackingEnabled !== undefined) isTrackingEnabled = res.isTrackingEnabled;
  if (res?.isLinkTrackingEnabled !== undefined) isLinkTrackingEnabled = res.isLinkTrackingEnabled;
  if (res?.workerUrl) workerUrl = res.workerUrl;
  if (res?.sentMails && Array.isArray(res.sentMails)) {
    cachedTrackedMails = res.sentMails;
    injectThreadBadges();
  }
});

try {
  if (isContextValid()) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.isTrackingEnabled !== undefined) isTrackingEnabled = changes.isTrackingEnabled.newValue;
      if (changes.isLinkTrackingEnabled !== undefined) isLinkTrackingEnabled = changes.isLinkTrackingEnabled.newValue;
      if (changes.workerUrl !== undefined) workerUrl = changes.workerUrl.newValue;
      if (changes.sentMails && Array.isArray(changes.sentMails.newValue)) {
        cachedTrackedMails = changes.sentMails.newValue;
        injectThreadBadges();
      }
    });
  }
} catch (_) {}

function getComposeElements(triggerEl) {
  let container = null;
  let bodyEl = null;

  // IMPORTANT: Always find the TRUE outer compose dialog, NEVER stop at inner toolbars like table.iN
  if (triggerEl && triggerEl.nodeType === Node.ELEMENT_NODE) {
    container = triggerEl.closest('div[role="dialog"]') ||
                triggerEl.closest('div.M9') ||
                triggerEl.closest('div.AD') ||
                triggerEl.closest('div.aDh') ||
                triggerEl.closest('.adn.ads') ||
                triggerEl.closest('.nH');
  }

  // If container found, search bodyEl inside it
  if (container) {
    bodyEl = container.querySelector('div[role="textbox"][contenteditable="true"], div.Am.Al.editable[contenteditable="true"], div[contenteditable="true"][role="textbox"]');
  }

  // Fallback: search activeElement or all contenteditables on page
  if (!bodyEl) {
    if (document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true') {
      bodyEl = document.activeElement;
    } else {
      const editables = document.querySelectorAll('div[contenteditable="true"][role="textbox"], div.Am.Al.editable');
      bodyEl = editables[editables.length - 1] || null;
    }
  }

  // Ensure container is the full dialog parent of bodyEl
  if (bodyEl && !container) {
    container = bodyEl.closest('div[role="dialog"]') ||
                bodyEl.closest('div.M9') ||
                bodyEl.closest('div.AD') ||
                bodyEl.closest('div.aDh') ||
                bodyEl.parentElement;
  }

  return { container, bodyEl };
}

function getMySenderEmail() {
  const accountEl = document.querySelector('a[aria-label*="Google Account:"], .gb_d[aria-label*="@"]');
  if (accountEl) {
    const match = (accountEl.getAttribute('aria-label') || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (match) return match[0].toLowerCase();
  }
  return null;
}

// 100% Reliable Recipient Extraction (Strict Chip & Input Parsing ONLY)
function extractRecipients(container) {
  const emails = new Set();
  const searchRoot = container || document;
  const myEmail = getMySenderEmail();

  // 1. Check all standard Gmail recipient chips in To, Cc, Bcc
  const chipNodes = searchRoot.querySelectorAll('.vR span[email], .vR div[email], div[name="to"] span[email], div[aria-label*="To"] span[email], [data-hovercard-id], span.vN[email], .afV span[email]');
  chipNodes.forEach(node => {
    const val = node.getAttribute('email') || node.getAttribute('data-hovercard-id');
    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      const clean = val.trim().toLowerCase();
      if (!clean.includes('google.com') && (!myEmail || clean !== myEmail)) {
        emails.add(clean);
      }
    }
  });

  // 2. Check input fields (if user typed without pressing enter)
  const toInputs = searchRoot.querySelectorAll('input[name="to"], input[name="cc"], input[name="bcc"], input.agP, textarea[name="to"]');
  toInputs.forEach(input => {
    const val = input.value || '';
    const matches = val.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      matches.forEach(m => {
        const clean = m.trim().toLowerCase();
        if (!clean.includes('google.com') && (!myEmail || clean !== myEmail)) {
          emails.add(clean);
        }
      });
    }
  });

  // 3. Fallback: reply thread header
  if (emails.size === 0) {
    const author = document.querySelector('.gD[email]');
    if (author) {
      const authEmail = author.getAttribute('email')?.toLowerCase();
      if (authEmail && (!myEmail || authEmail !== myEmail)) {
        emails.add(authEmail);
      }
    }
  }

  // 4. Intentional self-send fallback
  if (emails.size === 0 && myEmail) {
    emails.add(myEmail);
  }

  return emails.size > 0 ? Array.from(emails).join(', ') : "Recipient";
}

// 100% Reliable Subject Extraction
function extractSubject(container) {
  const searchRoot = container || document;
  const subjInput = searchRoot.querySelector('input[name="subjectbox"], input[placeholder*="Subject"], input[aria-label*="Subject"]');
  if (subjInput && subjInput.value && subjInput.value.trim()) {
    return subjInput.value.trim();
  }

  // Reply mode: check thread title
  const threadSubj = document.querySelector('h2.hP');
  if (threadSubj && threadSubj.textContent && threadSubj.textContent.trim()) {
    return threadSubj.textContent.trim();
  }

  // Check document title if not a generic Inbox title
  if (document.title && !document.title.startsWith("Inbox") && !document.title.startsWith("Gmail")) {
    const cleaned = document.title
      .replace(/\s*-\s*[^@]+@[^@]+\s*-\s*Gmail$/i, '')
      .replace(/\s*-\s*Gmail$/i, '')
      .trim();
    if (cleaned) return cleaned;
  }

  return "(No Subject)";
}

function showToast(msg) {
  const prev = document.getElementById('mail-tracker-toast');
  if (prev) prev.remove();

  const toast = document.createElement('div');
  toast.id = 'mail-tracker-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 28px;
    background: #0f172a;
    color: #f8fafc;
    padding: 10px 18px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    z-index: 999999;
    border-left: 4px solid #38bdf8;
  `;
  toast.innerHTML = `<span>📨</span> <span>${msg}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

function armTracking(triggerEl) {
  if (!isTrackingEnabled) return;

  const { container, bodyEl } = getComposeElements(triggerEl);
  if (!bodyEl) return;

  // Check per-compose toggle: if user clicked [Track: OFF]
  const trackBtn = container ? container.querySelector('.mail-tracker-badge') : null;
  if (trackBtn && trackBtn.getAttribute('data-off') === 'true') {
    console.log("[Mail Tracker] Tracking turned OFF for this compose window.");
    return;
  }

  if (bodyEl.getAttribute('data-tracker-armed') === 'true' ||
      bodyEl.querySelector('img[data-mail-tracker="true"]')) {
    return;
  }
  bodyEl.setAttribute('data-tracker-armed', 'true');

  const recipients = extractRecipients(container);
  const subject = extractSubject(container);
  const trackId = "mail_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7);
  const sentTime = Date.now();

  // Check per-compose link toggle: if user clicked [Links: OFF]
  const linkBtn = container ? container.querySelector('.mail-tracker-link-badge') : null;
  const isLinkActive = linkBtn ? (linkBtn.getAttribute('data-off') !== 'true') : isLinkTrackingEnabled;

  // 1. Wrap external links with id & url ONLY IF isLinkActive (Protects BCC & Subject from leaking)
  if (isLinkActive) {
    const links = bodyEl.querySelectorAll('a[href]');
    links.forEach(a => {
      const raw = a.getAttribute('href');
      if (raw && /^https?:\/\//i.test(raw) && !raw.includes(workerUrl)) {
        const clickUrl = `${workerUrl}/click?id=${encodeURIComponent(trackId)}&url=${encodeURIComponent(raw)}`;
        a.setAttribute('href', clickUrl);
      }
    });
  } else {
    console.log("[Mail Tracker] Link tracking is OFF for this email - links kept 100% direct & raw!");
  }

  // 2. Inject clean tracking pixel with only random ID (Protects BCC & Subject from leaking in email HTML source)
  const trackUrl = `${workerUrl}/track?id=${encodeURIComponent(trackId)}`;
  const pixelImg = `<img src="${trackUrl}" width="1" height="1" alt="" data-mail-tracker="true" style="display:none !important; min-height:1px !important; min-width:1px !important; border:0 !important; margin:0 !important; padding:0 !important;" />`;
  bodyEl.insertAdjacentHTML("beforeend", pixelImg);

  // 3. Register email via /event
  const eventUrl = `${workerUrl}/event?type=sent&id=${encodeURIComponent(trackId)}&to=${encodeURIComponent(recipients)}&subj=${encodeURIComponent(subject)}&st=${sentTime}`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(eventUrl);
    } else {
      fetch(eventUrl, { method: 'GET', keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch (_) {
    fetch(eventUrl, { method: 'GET', keepalive: true, mode: 'no-cors' }).catch(() => {});
  }

  // 4. Save to chrome.storage.local
  const newRecord = {
    id: trackId,
    to: recipients,
    subject: subject,
    status: 'SENT',
    sentAt: new Date(sentTime).toISOString(),
    openCount: 0
  };

  safeStorageGet({ sentMails: [] }, (res) => {
    const list = res?.sentMails || [];
    list.unshift(newRecord);
    safeStorageSet({ sentMails: list.slice(0, 50) });
  });

  showToast(`Tracking active: ${subject} (${recipients})`);
  console.log(`[Mail Tracker] Armed: "${subject}" to ${recipients} (ID: ${trackId})`);
}

document.addEventListener('click', (e) => {
  const target = e.target;
  const sendBtn = target.closest('div[role="button"][data-tooltip*="Send"]') ||
                 target.closest('div[role="button"][aria-label*="Send"]') ||
                 target.closest('.T-I-atl') ||
                 target.closest('div[role="button"][data-tooltip*="Gönder"]') ||
                 target.closest('div[role="button"][data-tooltip*="Envoyer"]');

  if (sendBtn) {
    armTracking(sendBtn);
  }
}, true);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    armTracking(document.activeElement || e.target);
  }
}, true);

function enhanceToolbar() {
  const composeDialogs = document.querySelectorAll('div[role="dialog"], div.M9, div.AD, div.aDh, .adn.ads');

  composeDialogs.forEach((dialog) => {
    if (dialog.querySelector('.mail-tracker-toolbar-group')) return;

    // Find the Send button area
    const sendBtn = dialog.querySelector('div[role="button"][data-tooltip*="Send"], div[role="button"][aria-label*="Send"], .T-I-atl');
    if (!sendBtn) return;

    const parentContainer = sendBtn.closest('.dC, .gU.Up, tr.btC td.gU') || sendBtn.parentElement;
    if (!parentContainer) return;

    // Remove any accidental orphan badges
    dialog.querySelectorAll('.mail-tracker-badge:not(.in-group)').forEach((el) => el.remove());

    const group = document.createElement('div');
    group.className = 'mail-tracker-toolbar-group in-group';
    group.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-left: 8px;
      vertical-align: middle;
    `;

    // 1. Open Tracking Button
    const trackBadge = document.createElement('span');
    trackBadge.className = 'mail-tracker-badge in-group';
    trackBadge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      font-weight: 600;
      color: #0d652d;
      background: #e6f4ea;
      border: 1px solid #ceead6;
      border-radius: 12px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    `;
    trackBadge.innerHTML = `📨 Track: <b>ON</b>`;
    trackBadge.title = "Toggle Email Open Tracking for this email";

    trackBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOff = trackBadge.getAttribute('data-off') === 'true';
      if (isOff) {
        trackBadge.removeAttribute('data-off');
        trackBadge.innerHTML = `📨 Track: <b>ON</b>`;
        trackBadge.style.color = '#0d652d';
        trackBadge.style.background = '#e6f4ea';
        trackBadge.style.borderColor = '#ceead6';
      } else {
        trackBadge.setAttribute('data-off', 'true');
        trackBadge.innerHTML = `📨 Track: <b>OFF</b>`;
        trackBadge.style.color = '#5f6368';
        trackBadge.style.background = '#f1f3f4';
        trackBadge.style.borderColor = '#dadce0';
      }
    });

    // 2. Link Click Tracking Button
    const linkBadge = document.createElement('span');
    linkBadge.className = 'mail-tracker-link-badge in-group';
    const isLinkInitOff = !isLinkTrackingEnabled;

    function updateLinkBadgeStyle(off) {
      if (off) {
        linkBadge.setAttribute('data-off', 'true');
        linkBadge.innerHTML = `🔗 Links: <b>OFF</b>`;
        linkBadge.style.color = '#9a3412';
        linkBadge.style.background = '#ffedd5';
        linkBadge.style.borderColor = '#fed7aa';
        linkBadge.title = "Link tracking is OFF (Raw clean links will be sent)";
      } else {
        linkBadge.removeAttribute('data-off');
        linkBadge.innerHTML = `🔗 Links: <b>ON</b>`;
        linkBadge.style.color = '#6b21a8';
        linkBadge.style.background = '#f3e8ff';
        linkBadge.style.borderColor = '#e9d5ff';
        linkBadge.title = "Link tracking is ON (Links will be tracked)";
      }
    }

    linkBadge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 8px;
      font-size: 11px;
      font-family: -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      font-weight: 600;
      border-radius: 12px;
      border-width: 1px;
      border-style: solid;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    `;
    updateLinkBadgeStyle(isLinkInitOff);

    linkBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOff = linkBadge.getAttribute('data-off') === 'true';
      updateLinkBadgeStyle(!isOff);
      isLinkTrackingEnabled = isOff;
      safeStorageSet({ isLinkTrackingEnabled: isOff });
    });

    group.appendChild(trackBadge);
    group.appendChild(linkBadge);

    parentContainer.appendChild(group);
  });
}

// ---------------------------------------------------------------------------
// GMAIL SENT BOX & INBOX IN-LINE CHECKMARKS (✓, ✓✓ Blue, ✓✓ Green, ✓✓ 🔗)
// ---------------------------------------------------------------------------
function injectThreadBadges() {
  if (!cachedTrackedMails || cachedTrackedMails.length === 0) return;

  const rows = document.querySelectorAll('tr.zA');
  if (!rows || rows.length === 0) return;

  rows.forEach((row) => {
    const subjEl = row.querySelector('span.bog, span.bqe');
    if (!subjEl) return;

    const rowSubj = (subjEl.textContent || "").trim();
    if (!rowSubj) return;

    const cleanRowSubj = rowSubj.toLowerCase().replace(/^(re|fwd):\s*/i, '').trim();

    const match = cachedTrackedMails.find((m) => {
      if (!m.subject) return false;
      const cleanMSubj = m.subject.toLowerCase().replace(/^(re|fwd):\s*/i, '').trim();
      return cleanMSubj === cleanRowSubj || cleanRowSubj.includes(cleanMSubj) || cleanMSubj.includes(cleanRowSubj);
    });

    if (!match) return;

    let badge = row.querySelector('.mailtracker-check');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'mailtracker-check';
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        margin-right: 6px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: default;
        user-select: none;
      `;
      subjEl.parentNode.insertBefore(badge, subjEl);
    }

    const st = (match.status || "SENT").toUpperCase();
    const openCount = match.openCount || (st === "OPENED" ? 1 : 0);
    const currentKey = `${st}_${openCount}`;

    if (badge.getAttribute('data-key') === currentKey) return;
    badge.setAttribute('data-key', currentKey);

    if (st === "CLICKED") {
      badge.innerHTML = `<span style="color:#9333ea; font-weight:800; font-size:12px; letter-spacing:-1px;" title="Link Clicked in Email! (${escapeHtml(match.to)})">✓✓ 🔗</span>`;
    } else if (st === "OPENED" || openCount > 0) {
      badge.innerHTML = `<span style="color:#16a34a; font-weight:800; font-size:12px; letter-spacing:-1px;" title="Opened ${openCount}x (${escapeHtml(match.to)})">✓✓ <span style="font-size:10px; font-weight:700;">${openCount}x</span></span>`;
    } else if (st === "DELIVERED") {
      badge.innerHTML = `<span style="color:#0284c7; font-weight:800; font-size:12px; letter-spacing:-1px;" title="Delivered to Inbox (${escapeHtml(match.to)})">✓✓</span>`;
    } else {
      badge.innerHTML = `<span style="color:#94a3b8; font-weight:700; font-size:12px;" title="Sent & Armed (${escapeHtml(match.to)})">✓</span>`;
    }
  });
}

// Periodically sync live status so Gmail checkmarks turn green in real-time
async function syncGmailTrackedStatus() {
  try {
    const res = await fetch(`${workerUrl}/api/status?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const list = data.emails || [];
      if (list.length > 0) {
        cachedTrackedMails = list;
        injectThreadBadges();
      }
    }
  } catch (_) {}
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================================================================
// SELF-OPEN PREVENTION: Block tracking pixels in Sender's own Gmail tab!
// Whenever the sender views their own Sent box or open threads, neutralize
// tracking pixels before they can hit Google Proxy or Cloudflare!
// =========================================================================
function neutralizeSelfPixels(root = document) {
  if (!root || !root.querySelectorAll) return;
  const imgs = root.querySelectorAll('img[src*="/track?"], img[src*="snapclip.tech/track"], img[src*="workers.dev/track"], img[data-mail-tracker], img[width="1"][height="1"], img[style*="min-height:1px"]');
  imgs.forEach((img) => {
    // Never neutralize inside an active compose editor window
    if (img.closest('div[role="textbox"][contenteditable="true"]')) return;
    img.removeAttribute('src');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    img.style.display = 'none';
    img.remove();
  });
}

// Automatically mute all sender's sent emails on Cloudflare Worker
// whenever the sender is active in or reloads the Sent box!
function pingSentBoxMute() {
  const hash = window.location.hash || '';
  let isViewingSent = hash.includes('sent') || hash.includes('in%3Asent');

  if (!isViewingSent) {
    const myEmail = getMySenderEmail();
    if (myEmail) {
      const fromEl = document.querySelector('.gD[email]');
      if (fromEl && fromEl.getAttribute('email')?.toLowerCase() === myEmail.toLowerCase()) {
        isViewingSent = true;
      }
    }
  }

  if (!isViewingSent) return;

  safeStorageGet(['workerUrl'], (res) => {
    const targetUrl = (res?.workerUrl || workerUrl || DEFAULT_WORKER_URL) + '/api/sent-mute?key=' + encodeURIComponent(DEFAULT_ADMIN_SECRET);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(targetUrl);
      } else {
        fetch(targetUrl, { method: 'GET', keepalive: true }).catch(() => {});
      }
    } catch (_) {}
  });
}

window.addEventListener('hashchange', pingSentBoxMute);
setInterval(pingSentBoxMute, 10000);
setTimeout(pingSentBoxMute, 300);

const selfOpenObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        neutralizeSelfPixels(node);
      }
    }
  }
});
const targetToObserve = document.documentElement || document.body || document;
try {
  selfOpenObserver.observe(targetToObserve, { childList: true, subtree: true });
} catch (_) {}

// =========================================================================
// SELF-CLICK PREVENTION: Sender clicking their own links in Gmail!
// If the sender clicks an outbound link inside their own Sent box/thread,
// open the destination directly WITHOUT triggering a fake click alert!
// =========================================================================
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href*="/click?"]');
  if (link) {
    const href = link.getAttribute('href') || '';
    if (!href.includes(workerUrl) && !href.includes('snapclip.tech') && !href.includes('workers.dev')) return;
    try {
      const parsed = new URL(href);
      const rawTarget = parsed.searchParams.get('url');
      if (rawTarget) {
        e.preventDefault();
        e.stopPropagation();
        window.open(rawTarget, '_blank');
        console.log("[Mail Tracker] Self-click prevented: direct open to", rawTarget);
      }
    } catch (_) {}
  }
}, true);

setInterval(enhanceToolbar, 1500);
setInterval(injectThreadBadges, 2500);
setInterval(syncGmailTrackedStatus, 30000);
