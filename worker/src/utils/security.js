import { DEFAULT_ADMIN_SECRET } from "../config.js";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Admin-Secret",
};

/**
 * Validates request authentication against ADMIN_SECRET.
 * Accepts X-Admin-Secret header, Bearer token, or ?key=? / ?secret=? query parameter.
 */
export function checkAdminAuth(request, url, env) {
  const secret = env?.ADMIN_SECRET || DEFAULT_ADMIN_SECRET;
  if (!secret) return true;
  const provided = request.headers.get("X-Admin-Secret") ||
                   request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
                   url.searchParams.get("key") ||
                   url.searchParams.get("secret");
  return provided === secret;
}

/**
 * Validates that redirect destination is a safe http/https URL.
 */
export function isSafeRedirectUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch (_) {
    return false;
  }
}

/**
 * Escapes special HTML characters to prevent XSS / Telegram parse errors.
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
