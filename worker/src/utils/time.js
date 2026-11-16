/**
 * Formats a timestamp into Asia/Dhaka localized date & time string.
 */
export function formatTime(ts) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: "Asia/Dhaka",
    dateStyle: "short",
    timeStyle: "medium"
  });
}

/**
 * Formats elapsed milliseconds into human-readable duration (e.g. 15s, 5m 20s).
 */
export function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
}
