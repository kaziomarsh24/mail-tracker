import worker from './index.js';
import assert from 'node:assert/strict';

// Mock execution context
const createMockCtx = () => {
  const promises = [];
  return {
    waitUntil(p) {
      promises.push(p);
    },
    async drain() {
      await Promise.all(promises);
    }
  };
};

// Mock environment
const env = {
  TELEGRAM_BOT_TOKEN: "9257112796:AAFfo9I4EPJ545F2cbgbYl3DIKG5P2gmips",
  TELEGRAM_CHAT_ID: "7191826750"
};

// Mock global caches
globalThis.caches = {
  default: {
    _cache: new Map(),
    async put(req, resp) {
      this._cache.set(req.url, resp.clone());
    },
    async match(req) {
      const match = this._cache.get(req.url);
      return match ? match.clone() : null;
    }
  }
};

async function runTests() {
  console.log("=== Testing Cloudflare Worker ===");

  // Test 1: OPTIONS CORS Preflight
  {
    console.log("Test 1: OPTIONS CORS Preflight");
    const req = new Request("https://mailtracker.test/event", { method: "OPTIONS" });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    console.log("✓ CORS preflight passed");
  }

  // Test 2: /event?type=sent (Register sent email)
  const testMailId = "mail_test_" + Math.random().toString(36).substring(2, 7);
  const now = Date.now();
  {
    console.log("Test 2: Register Email Sent via /event");
    const req = new Request(`https://mailtracker.test/event?type=sent&id=${testMailId}&to=client@company.com&subj=Quarterly%20Proposal&st=${now}`, {
      method: "GET"
    });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.email.id, testMailId);
    assert.equal(data.email.status, "SENT");
    console.log("✓ /event registered email successfully");
  }

  // Test 3: Self-Open Prevention (Hit within 3 seconds with standard browser UA)
  {
    console.log("Test 3: Self-Open Prevention (within 3 seconds, non-proxy UA)");
    const req = new Request(`https://mailtracker.test/track?id=${testMailId}&st=${now}`, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "image/gif");

    // Check status still SENT (self-open ignored)
    const statusReq = new Request(`https://mailtracker.test/api/status?id=${testMailId}&key=omar_track_sec_2026`);
    const statusRes = await worker.fetch(statusReq, env, ctx);
    const statusData = await statusRes.json();
    assert.equal(statusData.email.status, "DELIVERED");
    assert.equal(statusData.email.openCount, 0);
    console.log("✓ Self-open/scan hit was treated as DELIVERED without fake open count");
  }

  // Test 4: Delivered Proxy Scan (GoogleImageProxy hit within 30s)
  {
    console.log("Test 4: Delivered to Inbox (GoogleImageProxy scan within 30s)");
    const req = new Request(`https://mailtracker.test/track?id=${testMailId}&st=${now}`, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)"
      }
    });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "image/gif");

    // Check status updated to DELIVERED
    const statusReq = new Request(`https://mailtracker.test/api/status?id=${testMailId}&key=omar_track_sec_2026`);
    const statusRes = await worker.fetch(statusReq, env, ctx);
    const statusData = await statusRes.json();
    assert.equal(statusData.email.status, "DELIVERED");
    assert.notEqual(statusData.email.deliveredAt, null);
    console.log("✓ First proxy scan properly detected as DELIVERED to inbox");
  }

  // Test 5: Opened & Read (Subsequent open or open after 90s)
  {
    console.log("Test 5: Opened & Read (Subsequent open)");
    const req = new Request(`https://mailtracker.test/track?id=${testMailId}&st=${now - 100000}`, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      }
    });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);

    // Check status updated to OPENED, count = 1
    const statusReq = new Request(`https://mailtracker.test/api/status?id=${testMailId}&key=omar_track_sec_2026`);
    const statusRes = await worker.fetch(statusReq, env, ctx);
    const statusData = await statusRes.json();
    assert.equal(statusData.email.status, "OPENED");
    assert.equal(statusData.email.openCount, 1);
    console.log("✓ Genuine open detected, open count incremented to 1");
  }

  // Test 6: Repeat Open Deduplication (Within 120s debounce window)
  {
    console.log("Test 6: Repeat Open Deduplication (Within 120s window)");
    const req = new Request(`https://mailtracker.test/track?id=${testMailId}&st=${now - 300000}`, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const ctx = createMockCtx();
    await worker.fetch(req, env, ctx);

    const statusReq = new Request(`https://mailtracker.test/api/status?id=${testMailId}&key=omar_track_sec_2026`);
    const statusRes = await worker.fetch(statusReq, env, ctx);
    const statusData = await statusRes.json();
    assert.equal(statusData.email.status, "OPENED");
    assert.equal(statusData.email.openCount, 1);
    console.log("✓ Repeat open within debounce window was properly deduplicated (kept at 1x)");
  }

  // Test 7: /click (Link Click Tracking & 302 Redirect)
  {
    console.log("Test 7: /click Link Tracking & 302 Redirect");
    const targetUrl = "https://kaziomar.com/portfolio";
    const req = new Request(`https://mailtracker.test/click?id=${testMailId}&url=${encodeURIComponent(targetUrl)}`, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("Location"), targetUrl);

    // Verify email status changed to CLICKED
    const statusReq = new Request(`https://mailtracker.test/api/status?id=${testMailId}&key=omar_track_sec_2026`);
    const statusRes = await worker.fetch(statusReq, env, ctx);
    const statusData = await statusRes.json();
    assert.equal(statusData.email.status, "CLICKED");
    assert.equal(statusData.email.clicks.length, 1);
    assert.equal(statusData.email.clicks[0].url, targetUrl);
    console.log("✓ /click 302 redirected correctly and recorded CLICKED status");
  }

  // Test 8: /api/status endpoint returning all tracked emails
  {
    console.log("Test 8: /api/status returning all emails list");
    const req = new Request("https://mailtracker.test/api/status?key=omar_track_sec_2026", { method: "GET" });
    const ctx = createMockCtx();
    const res = await worker.fetch(req, env, ctx);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert(data.emails.length >= 1);
    assert.equal(data.emails[0].id, testMailId);
    console.log(`✓ /api/status returned ${data.total} tracked emails`);
  }

  console.log("\n🎉 ALL WORKER TESTS PASSED SUCCESSFULLY! 🎉\n");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
