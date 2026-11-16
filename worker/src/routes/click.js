import { corsHeaders, isSafeRedirectUrl } from "../utils/security.js";
import { getEmailRecord, saveEmailRecord } from "../storage/kv.js";
import { parseUserAgent } from "../services/device.js";
import { sendTelegram, buildClickAlert } from "../services/telegram.js";

/**
 * Handles `/click?id=...&url=...`
 * Link Tracking & 302 Redirect (Phishing-Protected)
 */
export async function handleClick(request, url, env, ctx) {
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
    const clickAlert = buildClickAlert(email, targetUrl, now, clickDevice, clickLocation);
    ctx.waitUntil(sendTelegram(clickAlert, env));
  }

  return Response.redirect(targetUrl, 302);
}
