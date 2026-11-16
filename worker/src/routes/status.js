import { corsHeaders } from "../utils/security.js";
import { 
  getEmailRecord, 
  getAllEmails, 
  deleteEmailRecord, 
  clearAllRecords, 
  setSenderMuted, 
  setLastKvMuteWrite, 
  senderSentMutedUntil, 
  lastKvMuteWriteTime 
} from "../storage/kv.js";

/**
 * Handles `/api/status`
 * Returns email status or full history list.
 */
export async function handleStatus(request, url, env, ctx) {
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

/**
 * Handles `/api/delete` or DELETE `/api/email`
 */
export async function handleDeleteEmail(request, url, env, ctx) {
  let id = url.searchParams.get("id");
  if (!id && request.method === "DELETE") {
    try {
      const body = await request.json();
      id = body.id;
    } catch (_) {}
  }

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing email id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await deleteEmailRecord(id, env);

  return new Response(JSON.stringify({ success: true, deleted: id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Handles `/api/clear`
 */
export async function handleClearAll(request, url, env, ctx) {
  await clearAllRecords(env);
  return new Response(JSON.stringify({ success: true, cleared: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Handles `/api/sent-mute`
 * Suppresses self-opens when sender views Sent box.
 * Throttled to prevent burning KV write quota.
 */
export async function handleSentMute(request, url, env, ctx) {
  const now = Date.now();
  const mutedUntil = now + 45000;
  setSenderMuted(mutedUntil);

  if (env && env.TRACKER_KV && (now - lastKvMuteWriteTime > 60000)) {
    setLastKvMuteWrite(now);
    ctx.waitUntil(env.TRACKER_KV.put("__SENDER_MUTED_UNTIL__", String(now + 60000), { expirationTtl: 120 }).catch(() => {}));
  }

  return new Response(JSON.stringify({ success: true, mutedUntil }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
