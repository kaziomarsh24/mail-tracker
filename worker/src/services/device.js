/**
 * Parses raw HTTP User-Agent string into a clean, human-readable Device and Client name.
 * Returns clean strings like "Linux PC (Firefox)", "Mac (Chrome)", "iPhone (Safari)", etc.
 */
export function parseUserAgent(ua, isProxy) {
  if (isProxy) return "Gmail App / Google Proxy";
  if (!ua) return "Unknown Device";

  // Operating System / Device Type
  let os = "Desktop";

  if (/iphone/i.test(ua)) {
    os = "iPhone";
  } else if (/ipad/i.test(ua)) {
    os = "iPad";
  } else if (/android/i.test(ua)) {
    os = "Android";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "Mac";
  } else if (/windows nt/i.test(ua)) {
    os = "Windows PC";
  } else if (/linux/i.test(ua)) {
    os = "Linux PC";
  }

  // Browser / Email Client
  let client = "";
  if (/thunderbird/i.test(ua)) {
    client = "Thunderbird Mail";
  } else if (/outlook/i.test(ua)) {
    client = "Outlook";
  } else if (/edg\//i.test(ua)) {
    client = "Edge";
  } else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) {
    client = "Chrome";
  } else if (/firefox|fxios|rv:\d+/i.test(ua)) {
    client = "Firefox";
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    client = "Safari / Apple Mail";
  }

  return `${os}${client ? ` (${client})` : ""}`;
}
