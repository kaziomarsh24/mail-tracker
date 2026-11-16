/**
 * Default Configuration & Global Constants
 */
export const DEFAULT_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
export const DEFAULT_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID";
export const DEFAULT_ADMIN_SECRET = "omar_track_sec_2026";
export const DEFAULT_DASHBOARD_URL = "https://t.snapclip.tech/dashboard";

// 1x1 Transparent GIF (43 bytes)
export const GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const GIF_BYTES = Uint8Array.from(atob(GIF_BASE64), c => c.charCodeAt(0));
