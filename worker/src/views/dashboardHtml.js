/**
 * Renders the standalone full-screen Web & Mobile Dashboard HTML.
 * Uses clean Lucide vector SVG icons, zero cheap emojis, and responsive tables.
 */
export function renderDashboardHtml(origin) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>MailTracker Live Dashboard</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #111827;
      --border: #1f2937;
      --text: #f9fafb;
      --muted: #9ca3af;
      --primary: #38bdf8;
      --deliv: #3b82f6;
      --open: #10b981;
      --click: #a855f7;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 16px;
      line-height: 1.5;
    }
    .wrap { max-width: 1040px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 14px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .title { font-size: 18px; font-weight: 700; color: var(--primary); display: flex; align-items: center; gap: 8px; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 14px;
      border-radius: 10px;
      text-align: center;
    }
    .kpi-lbl { font-size: 11px; text-transform: uppercase; color: var(--muted); font-weight: 600; letter-spacing: 0.5px; }
    .kpi-val { font-size: 24px; font-weight: 800; margin-top: 4px; }
    
    .table-box {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    table { width: 100%; border-collapse: collapse; min-width: 620px; font-size: 13px; }
    th {
      background: #0f172a;
      padding: 12px 14px;
      text-align: left;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      white-space: nowrap;
    }
    td { padding: 12px 14px; border-bottom: 1px solid var(--border); }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .tag-sent { background: rgba(148,163,184,0.15); color: #cbd5e1; }
    .tag-deliv { background: rgba(59,130,246,0.15); color: #60a5fa; }
    .tag-open { background: rgba(16,185,129,0.15); color: #34d399; }
    .tag-click { background: rgba(168,85,247,0.15); color: #c084fc; }

    .del-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .del-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.3);
      color: var(--danger);
    }
    .timeline {
      padding: 10px 14px;
      background: #0b1120;
      border-radius: 6px;
      margin: 4px 0;
      font-size: 12px;
      color: #94a3b8;
      border-left: 3px solid var(--primary);
    }
    .timeline div { margin: 4px 0; }
    .btn {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .btn:hover { background: #1e293b; }
    .swipe-hint {
      display: none;
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
      text-align: right;
    }
    @media (max-width: 640px) {
      .swipe-hint { display: block; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
        MailTracker Live Monitor
      </div>
      <div>
        <button class="btn" id="refreshBtn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          Refresh
        </button>
      </div>
    </header>

    <div class="kpis">
      <div class="kpi"><div class="kpi-lbl">Total Sent</div><div class="kpi-val" id="kSent">0</div></div>
      <div class="kpi"><div class="kpi-lbl">Delivered</div><div class="kpi-val" style="color:var(--deliv);" id="kDeliv">0</div></div>
      <div class="kpi"><div class="kpi-lbl">Opened</div><div class="kpi-val" style="color:var(--open);" id="kOpen">0</div></div>
      <div class="kpi"><div class="kpi-lbl">Clicked</div><div class="kpi-val" style="color:var(--click);" id="kClick">0</div></div>
    </div>

    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Opens</th>
            <th>Sent Time</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="mailRows">
          <tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted);">Loading emails...</td></tr>
        </tbody>
      </table>
    </div>
    <div class="swipe-hint">Swipe table horizontally to view more columns</div>
  </div>

  <script>
    const origin = "${origin}";
    const urlParams = new URLSearchParams(window.location.search);
    const secretKey = urlParams.get('key') || urlParams.get('secret') || '';
    const openSet = new Set();

    async function loadData() {
      try {
        let fetchUrl = origin + '/api/status';
        if (secretKey) fetchUrl += '?key=' + encodeURIComponent(secretKey);
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          document.getElementById('mailRows').innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#f87171;">Unauthorized: Provide valid ?key=YOUR_SECRET in URL</td></tr>';
          return;
        }
        const data = await res.json();
        render(data.emails || []);
      } catch (e) {
        document.getElementById('mailRows').innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#f87171;">Failed to load data</td></tr>';
      }
    }

    function esc(s) {
      if (!s) return "";
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function render(emails) {
      const sent = emails.length;
      let deliv = 0, opened = 0, clicked = 0;
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
        const svgSent = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
        const svgDeliv = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>';
        const svgOpen = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
        const svgClick = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>';
        const svgTrash = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

        let tag = '<span class="tag tag-sent">' + svgSent + 'Sent</span>';
        if (s === 'CLICKED') tag = '<span class="tag tag-click">' + svgClick + 'Clicked</span>';
        else if (s === 'OPENED' || m.openCount > 0) tag = '<span class="tag tag-open">' + svgOpen + 'Opened (' + (m.openCount || 1) + 'x)</span>';
        else if (s === 'DELIVERED') tag = '<span class="tag tag-deliv">' + svgDeliv + 'Delivered</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = '<td><b>' + esc(m.to||'N/A') + '</b></td><td>' + esc(m.subject||'(No Subject)') + '</td><td>' + tag + '</td><td><b>' + (m.openCount||0) + 'x</b></td><td>' + (m.sentAt ? new Date(m.sentAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '—') + '</td><td><button class="del-btn" data-id="' + esc(m.id) + '" title="Delete Record">' + svgTrash + '</button></td>';
        
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
    }

    document.getElementById('mailRows').addEventListener('click', async (e) => {
      const delBtn = e.target.closest('.del-btn');
      if (!delBtn) return;
      e.stopPropagation();
      const id = delBtn.getAttribute('data-id');
      if (!confirm('Are you sure you want to delete email record: ' + id + '?')) return;
      try {
        let delUrl = origin + '/api/delete?id=' + encodeURIComponent(id);
        if (secretKey) delUrl += '&key=' + encodeURIComponent(secretKey);
        const res = await fetch(delUrl, { method: 'DELETE' });
        if (res.ok) loadData();
      } catch (err) {
        alert('Failed to delete email: ' + err.message);
      }
    });

    document.getElementById('refreshBtn').onclick = loadData;
    loadData();
    setInterval(loadData, 10000);
  </script>
</body>
</html>`;
}
