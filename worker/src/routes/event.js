import { corsHeaders } from "../utils/security.js";
import { getEmailRecord, saveEmailRecord } from "../storage/kv.js";
import { sendTelegram, buildSentAlert } from "../services/telegram.js";

/**
 * Handles `/event?type=sent&id=...&to=...&subj=...&st=...`
 * Registers a sent email in storage and sends an armed alert to Telegram.
 */
export async function handleEvent(request, url, env, ctx) {
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  const to = url.searchParams.get("to") || "Unknown Recipient";
  const subject = url.searchParams.get("subj") || "Important Email";
  const stParam = url.searchParams.get("st");

  if (type !== "sent" || !id) {
    return new Response(JSON.stringify({ error: "Invalid parameters" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const sentAt = stParam ? parseInt(stParam, 10) : now;

  const existing = await getEmailRecord(id, env);
  let emailRecord;
  if (existing) {
    emailRecord = {
      ...existing,
      to: (to && to !== "Unknown Recipient") ? to : (existing.to || "Unknown Recipient"),
      subject: (subject && subject !== "Important Email") ? subject : (existing.subject || "Important Email"),
      sentAt: existing.sentAt || sentAt,
    };
    if (!emailRecord.history) emailRecord.history = [];
    if (!emailRecord.history.some(h => h.event === "SENT")) {
      emailRecord.history.unshift({ event: "SENT", timestamp: sentAt, details: "Sent from Gmail" });
    }
  } else {
    emailRecord = {
      id: id,
      to: to || "Unknown Recipient",
      subject: subject || "Important Email",
      status: "SENT",
      sentAt: sentAt,
      deliveredAt: null,
      lastOpenedAt: null,
      openCount: 0,
      lastClickedAt: null,
      clicks: [],
      history: [{ event: "SENT", timestamp: sentAt, details: "Sent from Gmail" }],
    };
  }

  await saveEmailRecord(emailRecord, env);

  const alertText = buildSentAlert(emailRecord);
  ctx.waitUntil(sendTelegram(alertText, env));

  return new Response(JSON.stringify({ success: true, email: emailRecord }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
