// Full-Screen MailTracker Dashboard Controller
const DEFAULT_WORKER_URL = "https://mailtracker.softeng-kaziomar.workers.dev";
const CUSTOM_DOMAIN_URL = "https://t.snapclip.tech";
const DEFAULT_ADMIN_SECRET = "omar_track_sec_2026";

const SVG_ICONS = {
  sent: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  delivered: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  opened: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  clicked: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`
};

document.addEventListener("DOMContentLoaded", () => {
  const mailTableBody = document.getElementById("mailTableBody");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportBtn = document.getElementById("exportBtn");
  const searchInput = document.getElementById("searchInput");
  const filterPills = document.querySelectorAll(".pill");
  const clearAllBtn = document.getElementById("clearAllBtn");

  const kpiSent = document.getElementById("kpiSent");
  const kpiDelivered = document.getElementById("kpiDelivered");
  const kpiOpened = document.getElementById("kpiOpened");
  const kpiClicked = document.getElementById("kpiClicked");

  let allMails = [];
  let currentFilter = "all";
  let searchQuery = "";
  const openRowIds = new Set();

  // 1. Load data from chrome.storage.local & sync with worker
  loadData();

  // Auto-refresh every 10 seconds so UI updates in real-time when opened/clicked
  setInterval(loadData, 10000);

  async function loadData() {
    chrome.storage.local.get(["sentMails", "workerUrl"], async (res) => {
      let workerUrl = res.workerUrl || DEFAULT_WORKER_URL;
      if (res.sentMails && Array.isArray(res.sentMails)) {
        allMails = res.sentMails;
        render();
      }

      // Try fetching live from Worker /api/status with automatic failover
      let response = null;
      try {
        response = await fetch(`${workerUrl}/api/status?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, { cache: "no-store" });
      } catch (err) {
        // If custom domain DNS has not propagated yet, gracefully fallback to workers.dev
        if (workerUrl !== DEFAULT_WORKER_URL) {
          try {
            response = await fetch(`${DEFAULT_WORKER_URL}/api/status?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, { cache: "no-store" });
          } catch (_) {}
        }
      }

      if (response && response.ok) {
        try {
          const data = await response.json();
          const remoteList = data.emails || (Array.isArray(data) ? data : []);
          if (remoteList.length > 0) {
            const map = new Map();
            remoteList.forEach(m => map.set(m.id, m));
            allMails.forEach(local => {
              if (map.has(local.id)) {
                const remote = map.get(local.id);
                const to = (remote.to && remote.to !== "Unknown Recipient") ? remote.to : (local.to || remote.to);
                const subject = (remote.subject && remote.subject !== "Important Email" && remote.subject !== "(No Subject)") 
                  ? remote.subject 
                  : (local.subject || remote.subject);
                map.set(local.id, { ...local, ...remote, to, subject });
              } else {
                map.set(local.id, local);
              }
            });
            allMails = Array.from(map.values()).sort((a,b) => new Date(b.sentAt||0) - new Date(a.sentAt||0));
            chrome.storage.local.set({ sentMails: allMails });
            render();
          }
        } catch (_) {}
      }
    });
  }

  function render() {
    updateKPIs();
    renderTable();
  }

  function updateKPIs() {
    let sent = allMails.length;
    let delivered = 0;
    let opened = 0;
    let clicked = 0;

    allMails.forEach(m => {
      const st = (m.status || "SENT").toUpperCase();
      if (st === "CLICKED" || m.clicked) clicked++;
      else if (st === "OPENED" || (m.openCount && m.openCount > 0)) opened++;
      else if (st === "DELIVERED") delivered++;
    });

    kpiSent.textContent = sent;
    kpiDelivered.textContent = delivered;
    kpiOpened.textContent = opened;
    kpiClicked.textContent = clicked;
  }

  function renderTable() {
    const filtered = allMails.filter(m => {
      const st = (m.status || "SENT").toUpperCase();
      if (currentFilter !== "all") {
        if (currentFilter === "SENT" && st !== "SENT") return false;
        if (currentFilter === "OPENED" && st !== "OPENED" && (!m.openCount || m.openCount === 0)) return false;
        if (currentFilter === "DELIVERED" && st !== "DELIVERED") return false;
        if (currentFilter === "CLICKED" && st !== "CLICKED") return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const to = (m.to || "").toLowerCase();
        const subj = (m.subject || "").toLowerCase();
        const id = (m.id || "").toLowerCase();
        return to.includes(q) || subj.includes(q) || id.includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      mailTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">No matching emails found.</td></tr>`;
      return;
    }

    mailTableBody.innerHTML = "";
    filtered.forEach((m, idx) => {
      const row = document.createElement("tr");
      const detailRow = document.createElement("tr");
      detailRow.className = "detail-row";
      detailRow.id = `detail-${m.id || idx}`;

      const st = (m.status || "SENT").toUpperCase();
      let badgeHtml = `<span class="badge badge-sent">${SVG_ICONS.sent}Sent</span>`;
      if (st === "CLICKED") badgeHtml = `<span class="badge badge-clicked">${SVG_ICONS.clicked}Clicked</span>`;
      else if (st === "OPENED" || m.openCount > 0) badgeHtml = `<span class="badge badge-opened">${SVG_ICONS.opened}Opened</span>`;
      else if (st === "DELIVERED") badgeHtml = `<span class="badge badge-delivered">${SVG_ICONS.delivered}Delivered</span>`;

      const opensCount = m.openCount || (st === "OPENED" ? 1 : 0);
      const sentTimeStr = m.sentAt ? new Date(m.sentAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";
      
      let lastActivity = "—";
      if (m.lastClickedAt) lastActivity = `Clicked ${new Date(m.lastClickedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
      else if (m.lastOpenedAt) lastActivity = `Opened ${new Date(m.lastOpenedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
      else if (m.deliveredAt) lastActivity = `Delivered ${new Date(m.deliveredAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;

      row.innerHTML = `
        <td class="mail-to-cell">${escapeHtml(m.to)}</td>
        <td>${escapeHtml(m.subject || "(No Subject)")}</td>
        <td>${badgeHtml}</td>
        <td><b>${opensCount}x</b></td>
        <td>${sentTimeStr}</td>
        <td>${lastActivity}</td>
        <td><button class="del-btn" data-id="${escapeHtml(m.id)}" title="Delete from Cloudflare KV">${SVG_ICONS.trash}</button></td>
      `;

      // Timeline build
      const historyList = m.history || [];
      let timelineHtml = "";
      if (historyList.length > 0) {
        timelineHtml = historyList.map(h => {
          let info = h.details || h.proxy || h.url || "";
          if (h.device) {
            info = `${h.device}${h.location ? ` • ${h.location}` : ""}${info ? ` (${info})` : ""}`;
          }
          return `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <span class="timeline-title">${escapeHtml(h.event)}</span>
            <span>${new Date(h.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
            <span>${escapeHtml(info)}</span>
          </div>
        `}).join("");
      } else {
        timelineHtml = `
          <div class="timeline-item"><div class="timeline-dot"></div><span class="timeline-title">SENT:</span> Dispatched to ${escapeHtml(m.to)}</div>
          ${m.deliveredAt ? `<div class="timeline-item"><div class="timeline-dot" style="background:var(--delivered);"></div><span class="timeline-title">DELIVERED:</span> Received by Google Mail Server</div>` : ""}
          ${m.lastOpenedAt ? `<div class="timeline-item"><div class="timeline-dot" style="background:var(--opened);"></div><span class="timeline-title">OPENED:</span> Viewed by recipient (${opensCount} times)</div>` : ""}
          ${m.lastClickedAt ? `<div class="timeline-item"><div class="timeline-dot" style="background:var(--clicked);"></div><span class="timeline-title">LINK CLICKED:</span> Outbound URL action detected</div>` : ""}
        `;
      }

      detailRow.innerHTML = `
        <td colspan="7">
          <div class="detail-container">
            <div style="font-weight:600; font-size:13px; color:#38bdf8; margin-bottom:6px;">📊 Smart Event Timeline for: ${escapeHtml(m.to)}</div>
            <div style="font-size:11px; color:#94a3b8;">Tracking Tag ID: <code>${escapeHtml(m.id)}</code></div>
            <div class="timeline">${timelineHtml}</div>
          </div>
        </td>
      `;

      const rowKey = m.id || `idx-${idx}`;
      if (openRowIds.has(rowKey)) {
        detailRow.classList.add("open");
      }

      const delBtn = row.querySelector(".del-btn");
      if (delBtn) {
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete tracked email for "${m.to}"?`)) return;
          try {
            chrome.storage.local.get(["workerUrl"], async (st) => {
              const url = st.workerUrl || DEFAULT_WORKER_URL;
              await fetch(`${url}/api/delete?id=${encodeURIComponent(m.id)}&key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, { method: "POST" });
            });
          } catch (_) {}
          allMails = allMails.filter((item) => item.id !== m.id);
          openRowIds.delete(rowKey);
          chrome.storage.local.set({ sentMails: allMails });
          render();
        });
      }

      row.addEventListener("click", () => {
        const isOpen = detailRow.classList.toggle("open");
        if (isOpen) {
          openRowIds.add(rowKey);
        } else {
          openRowIds.delete(rowKey);
        }
      });

      mailTableBody.appendChild(row);
      mailTableBody.appendChild(detailRow);
    });
  }

  // Filter pills
  filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      filterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentFilter = pill.getAttribute("data-filter");
      renderTable();
    });
  });

  // Search input
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderTable();
  });

  // Refresh
  refreshBtn.addEventListener("click", () => {
    loadData();
  });

  // Clear All Data
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to permanently clear all tracked emails from Cloudflare KV and this dashboard?")) return;
      try {
        chrome.storage.local.get(["workerUrl"], async (st) => {
          const url = st.workerUrl || DEFAULT_WORKER_URL;
          await fetch(`${url}/api/clear?key=${encodeURIComponent(DEFAULT_ADMIN_SECRET)}`, { method: "POST" });
        });
      } catch (_) {}
      allMails = [];
      openRowIds.clear();
      chrome.storage.local.set({ sentMails: [] });
      render();
    });
  }

  // Export CSV
  exportBtn.addEventListener("click", () => {
    if (allMails.length === 0) return alert("No emails to export");
    const headers = ["ID", "Recipient", "Subject", "Status", "Opens", "SentAt", "LastOpenedAt", "LastClickedAt"];
    const rows = allMails.map(m => [
      `"${m.id||""}"`,
      `"${m.to||""}"`,
      `"${(m.subject||"").replace(/"/g, '""')}"`,
      `"${m.status||"SENT"}"`,
      `"${m.openCount||0}"`,
      `"${m.sentAt||""}"`,
      `"${m.lastOpenedAt||""}"`,
      `"${m.lastClickedAt||""}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `mail_tracker_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
