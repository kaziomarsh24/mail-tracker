// In-memory fallback and performance cache for Cloudflare Workers isolates
export const memoryStore = new Map();
export let memoryIndex = [];

// Lightweight single-timestamp mute to protect KV write limits
export let senderSentMutedUntil = 0;
export let lastKvMuteWriteTime = 0;

// Micro-cache for status API calls (deduplicates concurrent fetches)
export let cachedStatusList = null;
export let lastStatusFetchTime = 0;

export function setSenderMuted(until) {
  senderSentMutedUntil = until;
}

export function setLastKvMuteWrite(time) {
  lastKvMuteWriteTime = time;
}

export function invalidateCache() {
  cachedStatusList = null;
}

/**
 * Saves or updates an email record in KV and in-memory store.
 */
export async function saveEmailRecord(record, env) {
  memoryStore.set(record.id, record);
  if (!memoryIndex.includes(record.id)) {
    memoryIndex.unshift(record.id);
    if (memoryIndex.length > 100) memoryIndex.pop();
  }
  invalidateCache();

  if (env && env.TRACKER_KV) {
    try {
      await env.TRACKER_KV.put(record.id, JSON.stringify(record));
      
      let index = await env.TRACKER_KV.get("__INDEX__", "json");
      if (!Array.isArray(index)) index = [];
      if (!index.includes(record.id)) {
        index.unshift(record.id);
        if (index.length > 100) index = index.slice(0, 100);
        await env.TRACKER_KV.put("__INDEX__", JSON.stringify(index));
      }
    } catch (e) {
      console.error("[KV Save Error]", e);
    }
  }
}

/**
 * Retrieves a single email record by ID.
 */
export async function getEmailRecord(id, env) {
  if (memoryStore.has(id)) {
    return memoryStore.get(id);
  }

  if (env && env.TRACKER_KV) {
    try {
      const data = await env.TRACKER_KV.get(id, "json");
      if (data) {
        memoryStore.set(id, data);
        return data;
      }
    } catch (e) {
      console.error("[KV Get Error]", e);
    }
  }

  return null;
}

/**
 * Retrieves all tracked emails (up to 100 recent) using parallel batch fetches.
 */
export async function getAllEmails(env) {
  const now = Date.now();
  if (cachedStatusList && (now - lastStatusFetchTime < 4000)) {
    return cachedStatusList;
  }

  const results = [];
  const fetchedIds = new Set();

  if (env && env.TRACKER_KV) {
    try {
      const storedIndex = await env.TRACKER_KV.get("__INDEX__", "json");
      if (Array.isArray(storedIndex) && storedIndex.length > 0) {
        const topIds = storedIndex.slice(0, 100);
        
        const fetchedRecords = await Promise.all(
          topIds.map((id) => env.TRACKER_KV.get(id, "json"))
        );

        for (const item of fetchedRecords) {
          if (item && item.id) {
            results.push(item);
            fetchedIds.add(item.id);
            memoryStore.set(item.id, item);
          }
        }
      }
    } catch (e) {
      console.error("[KV Batch Get Error]", e);
    }
  }

  // Merge any memory-only records
  for (const [id, item] of memoryStore.entries()) {
    if (!fetchedIds.has(id)) {
      results.push(item);
      fetchedIds.add(id);
    }
  }

  results.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));

  cachedStatusList = results;
  lastStatusFetchTime = now;
  return results;
}

/**
 * Deletes a single email record by ID.
 */
export async function deleteEmailRecord(id, env) {
  memoryStore.delete(id);
  memoryIndex = memoryIndex.filter(i => i !== id);
  invalidateCache();

  if (env && env.TRACKER_KV) {
    try {
      await env.TRACKER_KV.delete(id);
      const storedIndex = await env.TRACKER_KV.get("__INDEX__", "json");
      if (Array.isArray(storedIndex)) {
        const newIndex = storedIndex.filter(i => i !== id);
        await env.TRACKER_KV.put("__INDEX__", JSON.stringify(newIndex));
      }
    } catch (e) {
      console.error("[KV Delete Error]", e);
    }
  }
}

/**
 * Clears all tracked emails.
 */
export async function clearAllRecords(env) {
  memoryStore.clear();
  memoryIndex = [];
  invalidateCache();

  if (env && env.TRACKER_KV) {
    try {
      let cursor = undefined;
      do {
        const list = await env.TRACKER_KV.list({ limit: 100, cursor });
        if (list && list.keys) {
          for (const k of list.keys) {
            await env.TRACKER_KV.delete(k.name);
          }
        }
        cursor = list.list_complete ? undefined : list.cursor;
      } while (cursor);
      await env.TRACKER_KV.put("__INDEX__", JSON.stringify([]));
    } catch (e) {
      console.error("[KV Clear Error]", e);
    }
  }
}
