// Background Service Worker for Gmail Mail Tracker
// Bypasses Gmail page CSP by executing all network requests in extension background context.

const DEFAULT_WORKER_URL = "https://mailtracker.softeng-kaziomar.workers.dev";
const DEFAULT_ADMIN_SECRET = "omar_track_sec_2026";

// Message dispatcher for content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  if (message.action === "register_event") {
    // Send email arming / registration event to worker
    fetch(message.url, { method: message.method || "GET", keepalive: true })
      .then((res) => res.json().catch(() => ({ ok: res.ok })))
      .then((data) => {
        console.log("[Background] Email armed successfully:", data);
        sendResponse({ success: true, data });
      })
      .catch((err) => {
        console.warn("[Background] Failed to arm email:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.action === "fetch_status") {
    fetch(message.url, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "sent_mute") {
    fetch(message.url, { method: "GET", keepalive: true })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

// Periodic background sync: fetch live status from worker and update chrome.storage.local
async function syncWorkerStatus() {
  try {
    const st = await chrome.storage.local.get(["workerUrl", "sentMails"]);
    const workerUrl = st.workerUrl || DEFAULT_WORKER_URL;
    const statusUrl = `${workerUrl}/api/status?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    
    const res = await fetch(statusUrl, { 
      cache: "no-store",
      signal: controller.signal 
    }).catch(() => null);
    
    clearTimeout(timeout);
    if (!res || !res.ok) return;

    const data = await res.json().catch(() => null);
    if (!data) return;

    const remoteList = data.emails || (Array.isArray(data) ? data : []);
    if (!remoteList || remoteList.length === 0) return;

    const localList = st.sentMails || [];
    const map = new Map();

    remoteList.forEach((m) => map.set(m.id, m));

    localList.forEach((local) => {
      if (map.has(local.id)) {
        const remote = map.get(local.id);
        const to = (remote.to && remote.to !== "Unknown Recipient") ? remote.to : (local.to || remote.to);
        const subject = (remote.subject && remote.subject !== "Important Email" && remote.subject !== "(No Subject)") 
          ? remote.subject 
          : (local.subject || remote.subject);

        map.set(local.id, {
          ...local,
          ...remote,
          to,
          subject,
        });
      } else {
        map.set(local.id, local);
      }
    });

    const merged = Array.from(map.values()).sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));
    await chrome.storage.local.set({ sentMails: merged.slice(0, 50) });
  } catch (err) {
    // Silently handle any transient network or storage drops
  }
}

// Sync on startup and periodically every 15 seconds
syncWorkerStatus();
setInterval(syncWorkerStatus, 15000);
