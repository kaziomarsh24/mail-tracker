import { DEFAULT_BOT_TOKEN, DEFAULT_CHAT_ID, DEFAULT_ADMIN_SECRET, DEFAULT_DASHBOARD_URL } from "../config.js";
import { escapeHtml } from "../utils/security.js";
import { formatTime, formatElapsed } from "../utils/time.js";

/**
 * Sends a structured HTML message to the configured Telegram chat with a direct dashboard link button.
 */
export async function sendTelegram(text, env, customUrl = null) {
  const token = env?.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  const chatId = env?.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;
  const adminSecret = env?.ADMIN_SECRET || DEFAULT_ADMIN_SECRET;

  if (!token || token === "YOUR_TELEGRAM_BOT_TOKEN" || !chatId || chatId === "YOUR_TELEGRAM_CHAT_ID") {
    console.warn("[Telegram] Skipping notification: bot token or chat ID is not configured.");
    return;
  }

  const dashBase = customUrl || env?.DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
  const dashUrl = dashBase.includes("?") ? `${dashBase}&key=${adminSecret}` : `${dashBase}?key=${adminSecret}`;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Open Live Dashboard", url: dashUrl }
        ]
      ]
    }
  };

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[Telegram] Send error:", err);
  }
}

/**
 * Builds the notification message when an email is first sent and armed.
 */
export function buildSentAlert(emailRecord) {
  return [
    `🚀 <b>EMAIL SENT &amp; ARMED</b>`,
    `───────────────────────────`,
    `<b>Recipient</b> : ${escapeHtml(emailRecord.to)}`,
    `<b>Subject</b>   : ${escapeHtml(emailRecord.subject)}`,
    `<b>Time</b>      : ${formatTime(emailRecord.sentAt)}`,
    `<b>Tag ID</b>    : <code>${escapeHtml(emailRecord.id)}</code>`,
    `───────────────────────────`,
    `<i>Real-time tracking active</i>`,
  ].join("\n");
}

/**
 * Builds the delivery notification (when Google Proxy pre-scans within 90s).
 */
export function buildDeliveryAlert(email, now, elapsed) {
  return [
    `⚪ <b>EMAIL DELIVERED</b>`,
    `───────────────────────────`,
    `<b>Recipient</b> : ${escapeHtml(email.to)}`,
    `<b>Subject</b>   : ${escapeHtml(email.subject)}`,
    `<b>Status</b>    : Landed in inbox (scanned by Google)`,
    `<b>Time</b>      : ${formatTime(now)} (${formatElapsed(elapsed)} after send)`,
    `<b>Tag ID</b>    : <code>${escapeHtml(email.id)}</code>`,
    `───────────────────────────`,
    `<i>Safe delivery confirmed</i>`,
  ].join("\n");
}

/**
 * Builds the genuine open alert (real human view).
 */
export function buildOpenAlert(email, now, elapsed, friendlyDevice, locationStr) {
  return [
    `🟢 <b>EMAIL OPENED · ${email.openCount}x</b>`,
    `───────────────────────────`,
    `<b>Recipient</b> : ${escapeHtml(email.to)}`,
    `<b>Subject</b>   : ${escapeHtml(email.subject)}`,
    `<b>Device</b>    : ${escapeHtml(friendlyDevice)}`,
    `<b>Location</b>  : ${escapeHtml(locationStr)}`,
    `<b>Time</b>      : ${formatTime(now)} (${formatElapsed(elapsed)} after send)`,
    `<b>Tag ID</b>    : <code>${escapeHtml(email.id)}</code>`,
    `───────────────────────────`,
    `<i>Recipient is reading your message right now</i>`,
  ].join("\n");
}

/**
 * Builds the link clicked notification.
 */
export function buildClickAlert(email, targetUrl, now, clickDevice, clickLocation) {
  return [
    `⚡ <b>LINK CLICKED IN EMAIL</b>`,
    `───────────────────────────`,
    `<b>Recipient</b> : ${escapeHtml(email.to)}`,
    `<b>Subject</b>   : ${escapeHtml(email.subject)}`,
    `<b>URL</b>       : <code>${escapeHtml(targetUrl)}</code>`,
    `<b>Device</b>    : ${escapeHtml(clickDevice)}`,
    `<b>Location</b>  : ${escapeHtml(clickLocation)}`,
    `<b>Time</b>      : ${formatTime(now)}`,
    `<b>Tag ID</b>    : <code>${escapeHtml(email.id)}</code>`,
    `───────────────────────────`,
    `<i>High-intent engagement detected</i>`,
  ].join("\n");
}
