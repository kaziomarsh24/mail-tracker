import { checkAdminAuth } from "../utils/security.js";
import { renderDashboardHtml } from "../views/dashboardHtml.js";

/**
 * Handles `/dashboard` route.
 * Enforces secret key auth before rendering web dashboard.
 */
export async function handleDashboardRoute(request, url, env) {
  if (!checkAdminAuth(request, url, env)) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>401 Protected</title><style>body{background:#0b0f19;color:#f9fafb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;}div{max-width:400px;background:#111827;border:1px solid #1f2937;padding:32px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);}h2{margin-bottom:8px;color:#f87171;}p{color:#9ca3af;font-size:14px;line-height:1.5;}code{background:#1e293b;padding:2px 6px;border-radius:4px;color:#38bdf8;font-size:13px;}</style></head><body><div><h2>Protected Dashboard</h2><p>This tracking dashboard is private. Please access via the direct link in your Telegram alert or provide your key: <code>?key=YOUR_SECRET</code></p></div></body></html>`,
      {
        status: 401,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }

  const html = renderDashboardHtml(url.origin);
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
