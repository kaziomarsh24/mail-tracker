/**
 * Cloudflare Worker for Personal Gmail Tracker v3.5 (Modular & Audited)
 * 
 * Routes:
 * - /event           : Registers newly sent email and arms tracker
 * - /track           : Serves 1x1 GIF, filters bot scanners, detects real opens
 * - /click           : Phishing-protected link redirection & click tracking
 * - /dashboard       : Standalone responsive web dashboard (Protected by key)
 * - /api/status      : JSON API for extension and dashboard sync
 * - /api/sent-mute   : Suppresses self-opens when sender is in Sent box
 * - /api/delete      : Deletes tracked email record
 * - /api/clear       : Clears tracked history
 */

import { corsHeaders, checkAdminAuth } from "./utils/security.js";
import { handleEvent } from "./routes/event.js";
import { handleTrack } from "./routes/track.js";
import { handleClick } from "./routes/click.js";
import { handleDashboardRoute } from "./routes/dashboard.js";
import { handleStatus, handleDeleteEmail, handleClearAll, handleSentMute } from "./routes/status.js";

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
      } else if (path === "/dashboard") {
        return await handleDashboardRoute(request, url, env);
      } else if (path === "/api/status") {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(JSON.stringify({ error: "Unauthorized. Secret key required." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return await handleStatus(request, url, env, ctx);
      } else if (path === "/api/delete" || (path === "/api/email" && request.method === "DELETE")) {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(JSON.stringify({ error: "Unauthorized. Secret key required." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return await handleDeleteEmail(request, url, env, ctx);
      } else if (path === "/api/clear") {
        if (!checkAdminAuth(request, url, env)) {
          return new Response(JSON.stringify({ error: "Unauthorized. Secret key required." }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return await handleClearAll(request, url, env, ctx);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error("[Worker Error]", err);
      return new Response(JSON.stringify({ error: "Internal Server Error", message: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
