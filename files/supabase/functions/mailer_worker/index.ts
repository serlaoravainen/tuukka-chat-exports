import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Soili <no-reply@soiliapp.fi>";
const BATCH_SIZE = parseInt(Deno.env.get("EMAIL_QUEUE_BATCH") ?? "5", 10);
const RATE_MS = parseInt(Deno.env.get("EMAIL_QUEUE_RATE_MS") ?? "1000", 10);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type EmailRow = {
  id: number;
  recipient: string;
  subject: string;
  body: string;
};

async function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendWithResend(to: string, subject: string, text: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
}

async function claimBatch(limit: number): Promise<EmailRow[]> {
  // 1) Poimi queued-rivit
  const { data: rows, error } = await sb
    .from("email_queue")
    .select("id, recipient, subject, body")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!rows?.length) return [];

  const ids = rows.map(r => r.id);

  // 2) Yritä merkata processing-tilaan vain queued-riveille
  const { error: updErr } = await sb
    .from("email_queue")
    .update({ status: "processing" })
    .in("id", ids)
    .eq("status", "queued");
  if (updErr) throw updErr;

  // 3) Palauta vain todella claimatut
  const { data: claimed, error: reErr } = await sb
    .from("email_queue")
    .select("id, recipient, subject, body")
    .in("id", ids)
    .eq("status", "processing");
  if (reErr) throw reErr;

  return (claimed ?? []) as EmailRow[];
}

async function processBatch(limit = BATCH_SIZE) {
  const batch = await claimBatch(limit);
  if (batch.length === 0) return { picked: 0, sent: 0, failed: 0 };

  let sent = 0, failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i];
    try {
      await sendWithResend(row.recipient, row.subject, row.body);
      await sb.from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("email_queue")
        .update({ status: "failed", error: msg.slice(0, 500), sent_at: new Date().toISOString() })
        .eq("id", row.id);
      failed++;
    }
    if (i < batch.length - 1) await delay(RATE_MS); // 2/s
  }
  return { picked: batch.length, sent, failed };
}

Deno.serve(async () => {
  try {
    const res = await processBatch(BATCH_SIZE);
    return new Response(JSON.stringify(res), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});

