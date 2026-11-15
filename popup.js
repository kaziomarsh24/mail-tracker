// Personal Gmail Tracker - Modern Popup Controller
const DEFAULT_WORKER_URL = "https://mailtracker.softeng-kaziomar.workers.dev";
const CUSTOM_DOMAIN_URL = "https://t.snapclip.tech";
const DEFAULT_ADMIN_SECRET = "omar_track_sec_2026";

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("trackingToggle");
  const toggleSubtitle = document.getElementById("toggleSubtitle");
  const linkToggle = document.getElementById("linkTrackingToggle");
  const linkToggleSubtitle = document.getElementById("linkToggleSubtitle");

  const domainToggleHeader = document.getElementById("domainToggleHeader");
  const domainBox = document.getElementById("domainBox");
  const domainInput = document.getElementById("domainInput");
  const saveDomainBtn = document.getElementById("saveDomainBtn");
  const domainStatusLbl = document.getElementById("domainStatusLbl");

  const testBtn = document.getElementById("testBtn");
  const mailList = document.getElementById("mailList");
  const refreshBtn = document.getElementById("refreshBtn");
  const clearBtn = document.getElementById("clearBtn");
  const syncDot = document.getElementById("syncDot");
  const syncText = document.getElementById("syncText");

  // Stat Counters
  const statSent = document.getElementById("statSent");
  const statDelivered = document.getElementById("statDelivered");
  const statOpened = document.getElementById("statOpened");
  const statClicked = document.getElementById("statClicked");

  let workerUrl = DEFAULT_WORKER_URL;
  let cachedMails = [];
  const expandedCardIds = new Set();

  // 1. Initial State Loading from Local Storage
  chrome.storage.local.get(["isTrackingEnabled", "isLinkTrackingEnabled", "workerUrl", "sentMails"], (res) => {
    if (res.isTrackingEnabled !== undefined) {
      toggle.checked = res.isTrackingEnabled;
      updateToggleUI(res.isTrackingEnabled);
    } else {
      updateToggleUI(true);
    }

    if (res.isLinkTrackingEnabled !== undefined) {
      linkToggle.checked = res.isLinkTrackingEnabled;
      updateLinkToggleUI(res.isLinkTrackingEnabled);
    } else {
      updateLinkToggleUI(true);
    }

    if (res.workerUrl) {
      workerUrl = res.workerUrl;
      domainInput.value = workerUrl;
      if (workerUrl.includes("snapclip.tech")) {
        domainStatusLbl.textContent = "snapclip.tech";
        domainStatusLbl.style.color = "#16a34a";
      } else {
        domainStatusLbl.textContent = "workers.dev";
      }
    } else {
      domainInput.value = DEFAULT_WORKER_URL;
    }

    if (res.sentMails && Array.isArray(res.sentMails)) {
      cachedMails = res.sentMails;
      renderMailList(cachedMails);
      updateStats(cachedMails);
    }

    fetchLiveStatuses();
    setInterval(fetchLiveStatuses, 4000);
  });

  // 2. Toggle Tracking Events
  toggle.addEventListener("change", () => {
    const isEnabled = toggle.checked;
    chrome.storage.local.set({ isTrackingEnabled: isEnabled });
    updateToggleUI(isEnabled);
  });

  linkToggle.addEventListener("change", () => {
    const isEnabled = linkToggle.checked;
    chrome.storage.local.set({ isLinkTrackingEnabled: isEnabled });
    updateLinkToggleUI(isEnabled);
  });

  function updateToggleUI(enabled) {
    if (enabled) {
      toggleSubtitle.textContent = "Invisible 1x1 pixel for opens & deliveries";
      toggleSubtitle.style.color = "var(--text-muted)";
    } else {
      toggleSubtitle.textContent = "Pixel paused for new emails";
      toggleSubtitle.style.color = "#dc2626";
    }
  }

  function updateLinkToggleUI(enabled) {
    if (enabled) {
      linkToggleSubtitle.textContent = "Wrap links with tracker (Turn OFF for clean links)";
      linkToggleSubtitle.style.color = "var(--text-muted)";
    } else {
      linkToggleSubtitle.textContent = "Link wrapping OFF - links are raw & clean";
      linkToggleSubtitle.style.color = "#ea580c";
    }
  }

  // 2.1 Domain accordion & save
  domainToggleHeader.addEventListener("click", () => {
    const isShown = domainBox.style.display !== "none";
    domainBox.style.display = isShown ? "none" : "block";
  });

  saveDomainBtn.addEventListener("click", () => {
    let raw = (domainInput.value || "").trim().replace(/\/+$/, "");
    if (!raw) raw = DEFAULT_WORKER_URL;
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    workerUrl = raw;
    chrome.storage.local.set({ workerUrl: raw });
    domainInput.value = raw;
    if (raw.includes("snapclip.tech")) {
      domainStatusLbl.textContent = "snapclip.tech";
      domainStatusLbl.style.color = "#16a34a";
    } else {
      domainStatusLbl.textContent = "workers.dev";
      domainStatusLbl.style.color = "#0284c7";
    }
    domainBox.style.display = "none";
    fetchLiveStatuses();
  });

  // 3. Status Badge Formatter
  function createStatusBadge(mail) {
    const status = (mail.status || "SENT").toUpperCase();
    const openCount = mail.openCount || (mail.opens ? mail.opens.length : 0) || 0;

    if (status === "CLICKED" || mail.clicked) {
      return `<span class="status-badge clicked">🎯 Link Clicked</span>`;
    }
    if (status === "OPENED" || openCount > 0) {
      const countLabel = openCount > 1 ? `Opened ${openCount}x` : "Opened";
      return `<span class="status-badge opened">👀 ${countLabel}</span>`;
    }
    if (status === "DELIVERED") {
      return `<span class="status-badge delivered">📥 Delivered</span>`;
    }
    return `<span class="status-badge sent">🚀 Sent</span>`;
  }

  // 4. Relative Time Formatter
  function formatRelativeTime(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 45) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // 5. Render Mail List
  function renderMailList(mails) {
    if (!mails || mails.length === 0) {
      mailList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📬</div>
          <div class="empty-title">No tracked emails yet</div>
          <div class="empty-desc">Send an email from Gmail with tracking active to monitor opens, deliveries, and clicks in real time.</div>
        </div>
      `;
      return;
    }

    mailList.innerHTML = "";
    mails.forEach((mail) => {
      const card = document.createElement("div");
      card.className = "mail-card";

      const badgeHtml = createStatusBadge(mail);
      const timeStr = formatRelativeTime(mail.sentAt);

      let extraDetail = "";
      if (mail.lastOpenedAt) {
        extraDetail = `<span class="mail-extra" style="color:#15803d;">Opened ${formatRelativeTime(mail.lastOpenedAt)}</span>`;
      } else if (mail.lastClickedAt) {
        extraDetail = `<span class="mail-extra" style="color:#7e22ce;">Clicked ${formatRelativeTime(mail.lastClickedAt)}</span>`;
      } else if (mail.deliveredAt) {
        extraDetail = `<span class="mail-extra" style="color:#0f766e;">Delivered ${formatRelativeTime(mail.deliveredAt)}</span>`;
      }

      const openCount = mail.openCount || (mail.status === "OPENED" ? 1 : 0);
      const drawerHtml = `
        <div class="mail-card-drawer">
          <div class="drawer-item"><b>Tag:</b> <code>${escapeHtml(mail.id || "N/A")}</code></div>
          <div class="drawer-item"><b>Sent:</b> ${mail.sentAt ? new Date(mail.sentAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : "Just now"}</div>
          ${mail.deliveredAt ? `<div class="drawer-item"><b>Delivered:</b> ${new Date(mail.deliveredAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} (Google Proxy)</div>` : ""}
          ${mail.lastOpenedAt ? `<div class="drawer-item"><b>Opens:</b> ${openCount}x (Last: ${new Date(mail.lastOpenedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })})</div>` : ""}
          ${mail.lastClickedAt ? `<div class="drawer-item"><b>Click:</b> Link opened at ${new Date(mail.lastClickedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>` : ""}
        </div>
      `;

      card.innerHTML = `
        <div class="mail-card-top">
          <div class="mail-recipient" title="${escapeHtml(mail.to)}">${escapeHtml(mail.to)}</div>
          ${badgeHtml}
        </div>
        <div class="mail-subject" title="${escapeHtml(mail.subject)}">${escapeHtml(mail.subject || "(No Subject)")}</div>
        <div class="mail-footer">
          <span class="mail-time">${timeStr}</span>
          ${extraDetail}
        </div>
        ${drawerHtml}
      `;

      const cardKey = mail.id;
      if (cardKey && expandedCardIds.has(cardKey)) {
        card.classList.add("expanded");
      }

      card.addEventListener("click", () => {
        const isExp = card.classList.toggle("expanded");
        if (cardKey) {
          if (isExp) expandedCardIds.add(cardKey);
          else expandedCardIds.delete(cardKey);
        }
      });

      mailList.appendChild(card);
    });
  }

  // 6. Update Stats Counters
  function updateStats(mails) {
    let sent = 0;
    let delivered = 0;
    let opened = 0;
    let clicked = 0;

    mails.forEach((m) => {
      sent++;
      const st = (m.status || "SENT").toUpperCase();
      if (st === "CLICKED" || m.clicked) clicked++;
      else if (st === "OPENED" || (m.openCount && m.openCount > 0)) opened++;
      else if (st === "DELIVERED") delivered++;
    });

    statSent.textContent = sent;
    statDelivered.textContent = delivered;
    statOpened.textContent = opened;
    statClicked.textContent = clicked;
  }

  // 7. Live Status Sync with Worker /api/status (with Automatic Failover)
  async function fetchLiveStatuses() {
    setSyncState("syncing");

    let res = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      res = await fetch(`${workerUrl}/api/status?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (err) {
      if (workerUrl !== DEFAULT_WORKER_URL) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          res = await fetch(`${DEFAULT_WORKER_URL}/api/status?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, {
            cache: "no-store",
            signal: controller.signal
          });
          clearTimeout(timeoutId);
        } catch (_) {}
      }
    }

    try {
      if (!res || !res.ok) throw new Error("Fetch failed");
      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        setSyncState("offline");
        return;
      }

      // Robust data normalization
      let remoteEmails = [];
      if (Array.isArray(data)) {
        remoteEmails = data;
      } else if (data.emails && Array.isArray(data.emails)) {
        remoteEmails = data.emails;
      } else if (data.items && Array.isArray(data.items)) {
        remoteEmails = data.items;
      } else if (typeof data === "object" && data !== null) {
        // May be key-value pair of id -> status info
        remoteEmails = Object.entries(data).map(([id, val]) => {
          if (typeof val === "object" && val !== null) {
            return { id, ...val };
          }
          return { id, status: val };
        });
      }

      if (remoteEmails.length > 0) {
        // Merge remote updates with cached emails
        const mergedMap = new Map();

        // Populate from remote first
        remoteEmails.forEach((re) => {
          if (re && re.id) mergedMap.set(re.id, re);
        });

        // Overlay with cached details (like subject/to if remote only kept id & status)
        cachedMails.forEach((local) => {
          if (mergedMap.has(local.id)) {
            const remote = mergedMap.get(local.id);
            mergedMap.set(local.id, {
              ...local,
              ...remote,
              to: remote.to || local.to,
              subject: remote.subject || local.subject,
              sentAt: remote.sentAt || local.sentAt,
              status: remote.status || local.status,
              openCount: remote.openCount !== undefined ? remote.openCount : local.openCount
            });
          } else {
            mergedMap.set(local.id, local);
          }
        });

        cachedMails = Array.from(mergedMap.values());
        // Sort newest first
        cachedMails.sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0));

        // Save updated list to storage
        chrome.storage.local.set({ sentMails: cachedMails.slice(0, 50) });
        renderMailList(cachedMails);
        updateStats(cachedMails);
      }

      setSyncState("live");
    } catch (_) {
      setSyncState("offline");
    }
  }

  function setSyncState(state) {
    if (state === "syncing") {
      syncDot.className = "sync-dot syncing";
      syncText.textContent = "Syncing";
      refreshBtn.classList.add("spinning");
    } else if (state === "live") {
      syncDot.className = "sync-dot";
      syncText.textContent = "Live";
      refreshBtn.classList.remove("spinning");
    } else {
      syncDot.className = "sync-dot offline";
      syncText.textContent = "Offline";
      refreshBtn.classList.remove("spinning");
    }
  }

  // 8. Refresh & Dashboard Button Clicks
  refreshBtn.addEventListener("click", () => {
    fetchLiveStatuses();
  });

  const openDashboardBtn = document.getElementById("openDashboardBtn");
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
  }

  // 9. Clear History Button
  clearBtn.addEventListener("click", async () => {
    if (confirm("Clear tracked email history from both Cloudflare KV and local dashboard?")) {
      try {
        await fetch(`${workerUrl}/api/clear?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, { method: "POST" });
      } catch (_) {}
      cachedMails = [];
      chrome.storage.local.set({ sentMails: [] });
      renderMailList([]);
      updateStats([]);
    }
  });

  // 10. Send Test Alert Button
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    testBtn.classList.remove("success", "error");
    testBtn.innerHTML = `<span>⏳ Sending alert to Telegram...</span>`;

    const testId = "test_" + Date.now().toString(36);
    const testTo = "demo-recipient@example.com";
    const testSubj = "MailTracker Test Alert Verification";

    try {
      // Fire event to worker
      const pingUrl = `${workerUrl}/event?type=sent&id=${encodeURIComponent(testId)}&to=${encodeURIComponent(testTo)}&subj=${encodeURIComponent(testSubj)}&st=${Date.now()}`;
      const res = await fetch(pingUrl);

      if (!res.ok) {
        // Fallback to track pixel ping if /event is unavailable
        await fetch(`${workerUrl}/track?id=${encodeURIComponent(testId)}&to=${encodeURIComponent(testTo)}&st=${Date.now() - 45000}`);
      }

      testBtn.classList.add("success");
      testBtn.innerHTML = `<span>✓ Alert Sent to Telegram!</span>`;

      // Add test email to local history so user sees immediate visual feedback
      cachedMails.unshift({
        id: testId,
        to: testTo,
        subject: testSubj,
        status: "SENT",
        openCount: 0,
        sentAt: new Date().toISOString()
      });
      chrome.storage.local.set({ sentMails: cachedMails.slice(0, 50) });
      renderMailList(cachedMails);
      updateStats(cachedMails);

      setTimeout(() => {
        testBtn.disabled = false;
        testBtn.classList.remove("success");
        testBtn.innerHTML = `<span>⚡ Send Test Alert to Telegram</span>`;
      }, 2500);
    } catch (err) {
      console.error("[Mail Tracker] Test ping failed:", err);
      testBtn.classList.add("error");
      testBtn.innerHTML = `<span>✗ Ping Failed (Check Worker)</span>`;
      setTimeout(() => {
        testBtn.disabled = false;
        testBtn.classList.remove("error");
        testBtn.innerHTML = `<span>⚡ Send Test Alert to Telegram</span>`;
      }, 2500);
    }
  });

  // Utility: HTML Escaping
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
