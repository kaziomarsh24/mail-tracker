import { GIF_BYTES } from "../config.js";
import { getEmailRecord, saveEmailRecord, senderSentMutedUntil } from "../storage/kv.js";
import { parseUserAgent } from "../services/device.js";
import { sendTelegram, buildDeliveryAlert, buildOpenAlert } from "../services/telegram.js";

function returnPixel() {
  return new Response(GIF_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": "43",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0",
      "Pragma": "no-cache",
      "Expires": "Thu, 01 Jan 1970 00:00:00 GMT",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Handles `/track?id=...&st=...`
 */
export async function handleTrack(request, url, env, ctx) {
  const id = url.searchParams.get("id");
  const to = url.searchParams.get("to");
  const subjParam = url.searchParams.get("subj");
  const stParam = url.searchParams.get("st");

  if (!id) return returnPixel();

  const userAgent = request.headers.get("user-agent") || "";
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
  // 1. SENDER SENT-BOX SELF-OPEN SUPPRESSION
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
  // 2. BOT / PRE-FETCH SCAN FILTER (< 90 SECONDS)
  // Hits within 90 seconds are marked as DELIVERED to inbox.
  // =========================================================================
  if (elapsed < 90000) {
    if (!email.deliveredAt) {
      email.deliveredAt = now;
      if (email.status === "SENT") email.status = "DELIVERED";
      email.history.push({ event: "DELIVERED", timestamp: now, details: "Landed in inbox (scanned by Google Proxy)" });
      await saveEmailRecord(email, env);

      const deliverAlert = buildDeliveryAlert(email, now, elapsed);
      ctx.waitUntil(sendTelegram(deliverAlert, env));
    }
    return returnPixel();
  }

  // =========================================================================
  // 3. REAL HUMAN OPEN (>= 90 SECONDS)
  // Deduplicate repeat opens within 120 seconds to prevent reload spam.
  // =========================================================================
  if (email.lastOpenedAt && (now - email.lastOpenedAt < 120000)) {
    return returnPixel();
  }

  email.openCount = (email.openCount || 0) + 1;
  email.lastOpenedAt = now;
  if (!email.deliveredAt) email.deliveredAt = now;
  if (email.status !== "CLICKED") email.status = "OPENED";

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

  const openAlert = buildOpenAlert(email, now, elapsed, friendlyDevice, locationStr);
  ctx.waitUntil(sendTelegram(openAlert, env));

  return returnPixel();
}
