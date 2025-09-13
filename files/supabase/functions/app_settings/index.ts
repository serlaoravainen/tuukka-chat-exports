// supabase/functions/app_settings/index.ts
// Täysin tuotantokelpoinen: CORS, auth-tarkistus, zod-validointi, GET/PUT
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

// --- CORS + DEV bypass ---
const ALLOW_ORIGIN = (Deno.env.get("CORS_ORIGIN") ?? "*").trim();
const DEV_ALLOW_NOAUTH =
  (Deno.env.get("DEV_ALLOW_NOAUTH") ?? "false").toLowerCase() === "true";

function parseList(s: string) {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
const ALLOWED_LIST = ALLOW_ORIGIN === "*" ? [] : parseList(ALLOW_ORIGIN);

function pickOrigin(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  if (ALLOW_ORIGIN === "*" || origin === "") return "*";
  return ALLOWED_LIST.includes(origin) ? origin : "null";
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, x-client-info, apikey",
    Vary: "Origin",
  };
}

// --- Admin-autentikointi (vain adminit saa kutsua) ---
// Vähintään toinen näistä: (a) ADMIN_EMAILS env-listassa tai (b) userin profile.is_admin = true
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Notification schema (synkassa settingsSchema.ts kanssa)
const NotifsSchema = z.object({
  emailNotifications: z.boolean(),
  adminNotificationEmails: z.array(z.string().email()).max(50),
  absenceRequests: z.boolean(),
  scheduleChanges: z.boolean(),
  employeeUpdates: z.boolean(),
  systemUpdates: z.boolean(),
  dailyDigest: z.boolean(),
  digestTime: z.string().regex(/^\d{2}:\d{2}$/),
});
type Notifs = z.infer<typeof NotifsSchema>;

async function isAdmin(authClient: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return false;
  const email = (user.email ?? "").toLowerCase();
  if (ADMIN_EMAILS.includes(email)) return true;
  const { data: prof } = await authClient
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return !!prof?.is_admin;
}

serve(async (req) => {
  // CORS
  const origin = pickOrigin(req);
  const base = corsHeaders(origin);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: base });
  }

   // 1) Admin-DB client (SERVICE ROLE) → käytä TÄTÄ kaikkiin DB-kirjoituksiin/lukuun
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 2) Auth client (ANON + request Authorization) → vain userin tarkistukseen
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
  );

  // DEV-bypass ennen admin-tarkistusta
  const reqOrigin = req.headers.get("Origin") ?? "";
  const devBypassOk =
    DEV_ALLOW_NOAUTH && (ALLOW_ORIGIN === "*" || ALLOWED_LIST.includes(reqOrigin));

  if (!devBypassOk) {
    const ok = await isAdmin(supabaseAuth);
    if (!ok) {
      return new Response(
        JSON.stringify({ code: 401, message: "Missing/invalid authorization" }),
        { status: 401, headers: { ...base, "content-type": "application/json" } }
      );
    }
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("app_settings")
        .select(
          "email_notifications, admin_notification_emails, absence_requests, schedule_changes, employee_updates, system_updates, daily_digest, digest_time"
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;

      const notifs: Notifs = {
        emailNotifications: data?.email_notifications ?? true,
        adminNotificationEmails: data?.admin_notification_emails ?? [],
        absenceRequests: data?.absence_requests ?? true,
        scheduleChanges: data?.schedule_changes ?? true,
        employeeUpdates: data?.employee_updates ?? false,
        systemUpdates: data?.system_updates ?? false,
        dailyDigest: data?.daily_digest ?? false,
        digestTime: data?.digest_time ?? "08:00",
      };
      const parsed = NotifsSchema.safeParse(notifs);
      const payload = parsed.success
        ? parsed.data
        : NotifsSchema.parse({
            emailNotifications: true,
            adminNotificationEmails: [],
            absenceRequests: true,
            scheduleChanges: true,
            employeeUpdates: false,
            systemUpdates: false,
            dailyDigest: false,
            digestTime: "08:00",
          });
      return new Response(
        JSON.stringify({ notifications: payload }),
        { headers: { ...base, "content-type": "application/json" } }
      );
    }

    if (req.method === "PUT") {
      const body = await req.json().catch(() => ({}));
      const parsed = NotifsSchema.safeParse(body?.notifications);
      if (!parsed.success) {
        const msg = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return new Response(
          JSON.stringify({ error: `Invalid notifications payload: ${msg}` }),
          { status: 400, headers: { ...base, "content-type": "application/json" } }
        );
      }
      const n = parsed.data;
      const { error } = await supabaseAdmin
        .from("app_settings")
        .upsert(
          {
            id: 1,
            email_notifications: n.emailNotifications,
            admin_notification_emails: n.adminNotificationEmails,
            absence_requests: n.absenceRequests,
            schedule_changes: n.scheduleChanges,
            employee_updates: n.employeeUpdates,
            system_updates: n.systemUpdates,
            daily_digest: n.dailyDigest,
            digest_time: n.digestTime,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...base, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...base, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[app_settings] error:", e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "Unknown error" }),
      { status: 500, headers: { ...base, "content-type": "application/json" } }
    );
  }
});