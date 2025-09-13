// supabase/functions/mailer/index.ts
// Prosessoi mailijonon: lähettää adminille mailin uusista poissaolopyynnöistä.
// Ajastus: cronilla esim. joka minuutti.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Types ---
type JobType = "admin_new_absence" | "employee_shift_changed" | "employee_new_shift" | "employee_shift_deleted" | string;
type ExtendedJobType = JobType | "employee_new_shift";
type EmployeeJobType = "employee_shift_changed" | "employee_new_shift" | "employee_shift_deleted";
const EMPLOYEE_JOB_TYPES: EmployeeJobType[] = ["employee_shift_changed","employee_new_shift","employee_shift_deleted"];
const MAIL_AGG_WINDOW_MIN = parseInt(Deno.env.get("MAIL_AGG_WINDOW_MIN") ?? "10", 10);

type BaseJob = {
  id: number;
  type: ExtendedJobType;
  payload: Record<string, unknown>;
  status: "queued" | "sent" | "failed" | string;
  attempt_count: number;
  last_error?: string | null;
  created_at: string;
  processed_at?: string | null;
};


type EmployeeShiftChangedPayload = {
  shift_id: string;
  employee_id: string;
  work_date: string;
  old_start?: string | null;
  old_end?: string | null;
  new_start?: string | null;
  new_end?: string | null;
};

type AppSettingsRow = {
  email_notifications: boolean;
  admin_notification_emails: string[];
  absence_requests: boolean;
  schedule_changes: boolean;
  employee_updates: boolean;
  system_updates: boolean;
  daily_digest: boolean;
  digest_time: string;
};

type MailJobRow = BaseJob;

// ---- ENV ----
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "Soili <onboarding@resend.dev>";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!RESEND_API_KEY) {
  throw new Error("Missing RESEND_API_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---- Resend sender ----
async function sendEmail(to: string[] | string, subject: string, text: string) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(`Resend failed: ${resp.status} ${errText}`);
  }
}

// ---- New: employee new shift ----
async function processEmployeeNewShift(job: BaseJob, settings: AppSettingsRow) {
  if (!settings.email_notifications) return "skipped: email_notifications=false";
  if (!settings.schedule_changes)    return "skipped: schedule_changes=false";

  const p = job.payload;
  const empId = String(p.employee_id ?? "");
  if (!empId) return "skipped: no employee_id";

  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("email,name")
    .eq("id", empId)
    .maybeSingle();
  if (empErr) throw empErr;
  const to = emp?.email;
  if (!to) return "skipped: employee has no email";

  const date = String(p.work_date ?? "");
  const s = p.start ? String(p.start) : "";
  const e = p.end   ? String(p.end)   : "";

  const subject = `Sinulle on lisätty uusi työvuoro (${date})`;
  const lines = [
    emp?.name ? `Hei ${emp.name},` : "Hei,",
    "",
    "Sinulle on lisätty uusi työvuoro:",
    `Aika: ${s}${e ? ` – ${e}` : ""}`,
    date ? `Päivä: ${date}` : null,
    "",
    "Terveisin,",
    "Soili",
  ].filter(Boolean).join("\n");

  await sendEmail([to], subject, lines);
  return "sent";
}

// ---- New: employee shift deleted ----
async function processEmployeeShiftDeleted(job: BaseJob, settings: AppSettingsRow) {
  if (!settings.email_notifications) return "skipped: email_notifications=false";
  if (!settings.schedule_changes)    return "skipped: schedule_changes=false";

  const p = job.payload;
  const empId = String(p.employee_id ?? "");
  if (!empId) return "skipped: no employee_id";

  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("email,name")
    .eq("id", empId)
    .maybeSingle();
  if (empErr) throw empErr;
  const to = emp?.email;
  if (!to) return "skipped: employee has no email";

  const date = String(p.work_date ?? "");
  const s = p.start ? String(p.start) : "";
  const e = p.end   ? String(p.end)   : "";

  const subject = `Vuorosi on peruttu (${date})`;
  const lines = [
    emp?.name ? `Hei ${emp.name},` : "Hei,",
    "",
    "Sinulle merkitty työvuoro on poistettu.",
    (s || e) ? `Aika: ${s}${e ? ` – ${e}` : ""}` : null,
    date ? `Päivä: ${date}` : null,
    "",
    "Jos tämä on virhe, ole yhteydessä esihenkilöösi.",
    "",
    "Terveisin,",
    "Soili",
  ].filter(Boolean).join("\n");

  await sendEmail([to], subject, lines);
  return "sent";
}

// ---- Process shift publication ----
async function processShiftPublication(job: BaseJob, settings: AppSettingsRow) {
  if (!settings.email_notifications) return "skipped: email_notifications=false";
  if (!settings.schedule_changes) return "skipped: schedule_changes=false";

  const p = job.payload;
  const empId = String(p.employee_id ?? "");
  if (!empId) return "skipped: no employee_id";

  // Hae työntekijän email
  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("email,name")
    .eq("id", empId)
    .maybeSingle();
  if (empErr) throw empErr;
  const to = emp?.email;
  if (!to) return "skipped: employee has no email";

  const date = String(p.work_date ?? "");
  const hours = p.hours ? String(p.hours) : "";
  const type = String(p.type ?? "");

  const subject = `Vuorosi on julkaistu (${date})`;
  const lines = [
    emp?.name ? `Hei ${emp.name},` : "Hei,",
    "",
    "Sinulle on julkaistu uusi työvuoro:",
    date ? `Päivä: ${date}` : null,
    hours ? `Tunnit: ${hours}` : null,
    type ? `Tyyppi: ${type}` : null,
    "",
    "Terveisin,",
    "Soili",
  ].filter(Boolean);

  const text = lines.join("\n");

  await sendEmail([to], subject, text);
  return "sent";
}


// =============== BULK MELUNESTO: KOONTI 5–10 MIN IKKUNASSA ===============
// Perusidea: kun törmätään yhteen employee_* jobiin, kerätään kaikki saman työntekijän
// queued/tuoreet jobit viimeisten N minuuttien sisällä, merkitään ne 'processing',
// lähetetään YKSI koontimaili ja merkataan kaikki 'sent'.

function cutoffISO(min: number) {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function isEmployeeJob(t: string): t is EmployeeJobType {
  return (EMPLOYEE_JOB_TYPES as string[]).includes(t);
}

async function claimViaRpc(employeeId: string, sinceISO: string, limit = 200) {
  const { data, error } = await sb.rpc("claim_employee_jobs", {
    p_employee_id: employeeId,
    p_since: sinceISO,
    p_types: EMPLOYEE_JOB_TYPES,
    p_limit: limit,
  });
  if (error) throw error;
  // supabase-js v2 palauttaa data: any[]; tyypitetään kevyesti
  return (data ?? []) as BaseJob[];
}


function fmtTimeMaybe(s?: string | null) {
  if (!s) return "";
  return String(s);
}

function summarizeEmployeeJobs(jobs: MailJobRow[]) {
  // Palauttaa rivit ja laskurit
  const lines: string[] = [];
  let added = 0, changed = 0, deleted = 0;
  // Lajittele ajankohdan mukaan display-friendly
  jobs.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const j of jobs) {
    const p = j.payload;
    const date = String(p["work_date"] ?? "");
    if (j.type === "employee_new_shift") {
      added++;
      const s = fmtTimeMaybe(p["start"] as string | undefined);
      const e = fmtTimeMaybe(p["end"] as string | undefined);
      lines.push(`• Uusi vuoro ${date}${s || e ? ` (${s}${e ? `–${e}` : ""})` : ""}`);
    } else if (j.type === "employee_shift_changed") {
      changed++;
      const os = fmtTimeMaybe(p["old_start"] as string | undefined);
      const oe = fmtTimeMaybe(p["old_end"] as string | undefined);
      const ns = fmtTimeMaybe(p["new_start"] as string | undefined);
      const ne = fmtTimeMaybe(p["new_end"] as string | undefined);
      lines.push(`• Vuoro päivitetty ${date}: ${os || oe ? `${os}–${oe} ⇒ ` : ""}${ns}–${ne}`);
    } else if (j.type === "employee_shift_deleted") {
      deleted++;
      const s = fmtTimeMaybe(p["start"] as string | undefined);
      const e = fmtTimeMaybe(p["end"] as string | undefined);
      lines.push(`• Vuoro poistettu ${date}${s || e ? ` (${s}${e ? `–${e}` : ""})` : ""}`);
    }
  }
  return { lines, added, changed, deleted };
}

type AggregationResult =
  | { kind: "handled"; claimedIds: number[]; count: number }
  | { kind: "failed"; claimedIds: number[]; error: string }
  | { kind: "fallback" };

async function processEmployeeJobsAggregated(anchorJob: BaseJob, settings: AppSettingsRow): Promise<AggregationResult> {
  if (!settings.email_notifications || !settings.schedule_changes) return "skipped: schedule notifications off";
  const empId = String(anchorJob.payload["employee_id"] ?? "");
  if (!empId) return "skipped: no employee_id";

  // Hae vastaanottaja
  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("email,name")
    .eq("id", empId)
    .maybeSingle();
  if (empErr) throw empErr;
  const to = emp?.email;
  if (!to) return "skipped: employee has no email";

  const since = cutoffISO(MAIL_AGG_WINDOW_MIN);
  const claimed = await claimViaRpc(empId, since);
  if (!claimed.length) {
    // Ei mitään koottavaa tämän ankkurin ympärille → anna kutsujan hoitaa fallback
    return { kind: "fallback" };
  }

  const { lines, added, changed, deleted } = summarizeEmployeeJobs(claimed);
  if (lines.length === 0) {
    await sb.from("mail_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
      .in("id", claimed.map(j => j.id));
    return { kind: "handled", claimedIds: claimed.map(j => j.id), count: 0 };
  }

  // subject esim: "Työvuoripäivitykset (5 kpl) – <päivämäärä>"
  const total = added + changed + deleted;
  const today = new Date().toISOString().slice(0,10);
  const subject = `Työvuoripäivitykset (${total} kpl) – ${today}`;
  const greeting = emp?.name ? `Hei ${emp.name},` : "Hei,";
  const text = [
    greeting, "", 
    "Tässä viimeisimmät muutokset työvuoroihisi:", 
    "", 
    ...lines, 
    "", 
    "Terveisin,", 
    "Soili"
  ].join("\n");

  try {
    await sendEmail([to], subject, text);
    // Merkkaa kaikki claimed sentiksi
    await sb.from("mail_jobs")
      .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
      .in("id", claimed.map(j => j.id));
    return { kind: "handled", claimedIds: claimed.map(j => j.id), count: total };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("mail_jobs")
      .update({ status: "failed", processed_at: new Date().toISOString(), last_error: msg.slice(0, 500) })
      .in("id", claimed.map(j => j.id));
    return { kind: "failed", claimedIds: claimed.map(j => j.id), error: msg };
  }
}



// ---- Load settings (DB is source of truth) ----
async function loadSettings(): Promise<AppSettingsRow> {
  const { data, error } = await sb
    .from("app_settings")
    .select("email_notifications, admin_notification_emails, absence_requests, schedule_changes, employee_updates, system_updates, daily_digest, digest_time")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data ?? {
    email_notifications: true,
    admin_notification_emails: [],
    absence_requests: true,
    schedule_changes: true,
    employee_updates: false,
    system_updates: false,
    daily_digest: false,
    digest_time: "08:00",
  };
}

// ---- Process one job ----
async function processAdminNewAbsence(job: BaseJob, settings: AppSettingsRow) {
  if (!settings.email_notifications) return "skipped: email_notifications=false";
  if (!settings.absence_requests) return "skipped: absence_requests=false";
  const recipients = settings.admin_notification_emails ?? [];
  if (!Array.isArray(recipients) || recipients.length === 0) return "skipped: no recipients";

  // Hae nimi
  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("name")
    .eq("id", String(job.payload.employee_id))
    .maybeSingle();

  if (empErr) throw empErr;

  const employeeName = emp?.name ?? "Tuntematon";
  const s = String(job.payload.start_date);
  const e = (job.payload.end_date ?? job.payload.start_date) as string;

  const subject = `Uusi poissaolopyyntö: ${employeeName} (${s}${e !== s ? `–${e}` : ""})`;
  const lines = [
    `Työntekijä: ${employeeName}`,
    `Ajankohta: ${s}${e !== s ? ` – ${e}` : ""}`,
    job.payload.reason ? `Syy: ${String(job.payload.reason)}` : null,
    // Voit halutessa lisätä dashboard-linkin .env:iin, esim. DASHBOARD_URL
    Deno.env.get("DASHBOARD_URL") ? `Avaa hallinta: ${Deno.env.get("DASHBOARD_URL")}` : null,
  ].filter(Boolean);
  const text = lines.join("\n");

  await sendEmail(recipients, subject, text);
  return "sent";
}

// ---- New: employee shift changed ----
async function processEmployeeShiftChanged(job: BaseJob, settings: AppSettingsRow) {
  if (!settings.email_notifications) return "skipped: email_notifications=false";
  if (!settings.schedule_changes)    return "skipped: schedule_changes=false";

  const p = job.payload as EmployeeShiftChangedPayload;
  const empId = String(p.employee_id ?? "");
  if (!empId) return "skipped: no employee_id";

  const { data: emp, error: empErr } = await sb
    .from("employees")
    .select("email,name")
    .eq("id", empId)
    .maybeSingle();
  if (empErr) throw empErr;
  const to = emp?.email;
  if (!to) return "skipped: employee has no email";

  const date = String(p.work_date ?? "");
  const oldS = p.old_start ? String(p.old_start) : "";
  const oldE = p.old_end   ? String(p.old_end)   : "";
  const newS = p.new_start ? String(p.new_start) : "";
  const newE = p.new_end   ? String(p.new_end)   : "";

  const subject = `Työvuorosi on muuttunut (${date})`;
  const lines = [
    emp?.name ? `Hei ${emp.name},` : "Hei,",
    "",
    "Työvuoriasi on päivitetty:",
    (oldS || oldE) ? `Aiemmin: ${oldS} – ${oldE}` : null,
    `Uusi:    ${newS} – ${newE}`,
    date ? `Päivä:   ${date}` : null,
    "",
    "Jos tämä ei käy, ole yhteydessä esihenkilöön.",
    "",
    "Terveisin,",
    "Soili",
  ].filter(Boolean).join("\n");

  await sendEmail([to], subject, lines);
  return "sent";
}


// ---- Main queue loop ----
async function processQueue(limit = 25) {
  const settings = await loadSettings();

  const { data: jobs, error } = await sb
    .from("mail_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!jobs || jobs.length === 0) return { processed: 0 };

  let success = 0;
  let failed = 0;

  // Koonti voi “nielaista” monta jobia kerralla. Pidetään kirjaa niistä, ettei
  // samaa satsiä käsitellä uudestaan saman loopin myöhemmillä iteraatioilla.
  const skipIds = new Set<number>();

  for (const job of jobs as BaseJob[]) {
    if (skipIds.has(job.id)) continue; // jo käsitelty osana koontia
    try {
      let outcome = "skipped";
      if (job.type === "admin_new_absence") {
        outcome = await processAdminNewAbsence(job, settings);
      } else if (isEmployeeJob(job.type)) {
        // UUSI: koonti viimeisen N minuutin ikkunassa
        const agg = await processEmployeeJobsAggregated(job, settings);
        if (agg.kind === "handled") {
          agg.claimedIds.forEach(id => skipIds.add(id));
          success++;
          continue; // koonti hoiti statukset
        }
        if (agg.kind === "failed") {
          agg.claimedIds.forEach(id => skipIds.add(id));
          failed++;
          continue; // koonti hoiti statukset failediksi
        }
        // agg.kind === "fallback" → käsitellään normaalisti yksittäisenä alla
      } else if (job.type === "employee_shift_changed") {
        // (varalle; normaalisti yllä oleva haaraa jo tämän)
        outcome = await processEmployeeShiftChanged(job, settings);
      } else if (job.type === "employee_new_shift") {
        outcome = await processEmployeeNewShift(job, settings);
      } else if (job.type === "employee_shift_deleted") {
        outcome = await processEmployeeShiftDeleted(job, settings);
      } else if (job.type === "shift_publication") {
        outcome = await processShiftPublication(job, settings);
      } else {
        outcome = `skipped: unknown type ${job.type}`;
      }

      // Päivitä tila
      await sb
        .from("mail_jobs")
        .update({
          status: outcome.startsWith("sent")
            ? "sent"
            : outcome.startsWith("skipped")
            ? "sent"
            : "failed",
          attempt_count: job.attempt_count + 1,
          last_error: outcome.startsWith("sent") ? null : outcome,
          processed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (outcome.startsWith("sent")) success++;
      else if (!outcome.startsWith("skipped")) failed++;
    } catch (e: unknown) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      await sb
        .from("mail_jobs")
        .update({
          status: "failed",
          attempt_count: job.attempt_count + 1,
          last_error: msg.slice(0, 500),
          processed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }


  return { processed: jobs.length, success, failed };
}

// ---- Edge entrypoint ----
Deno.serve(async () => {
  try {
    const res = await processQueue(25);
    return new Response(JSON.stringify(res), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});

