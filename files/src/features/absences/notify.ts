// src/features/absences/notify.ts
import { supabase } from "@/lib/supaBaseClient";
import { sendEmail } from "@/lib/sendEmail";
import { useSettingsStore } from "@/store/useSettingsStore";

export type AbsenceDecision = "approved" | "declined";

// --- Edge Functions: resolver + mailer trigger ---
function resolveFunctionsBase(): string {
  const direct = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL?.trim();
  if (direct) return direct.replace(/\/+$/, "");
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supaUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (supaUrl.includes("localhost") || supaUrl.includes("127.0.0.1")) {
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      if (h && h !== "localhost" && h !== "127.0.0.1") {
        return `http://${h}:54321/functions/v1`;
      }
    }
    return "http://127.0.0.1:54321/functions/v1";
  }
  return supaUrl.replace(".supabase.co", ".functions.supabase.co");
}

async function triggerMailerNow() {
  try {
    const url = `${resolveFunctionsBase()}/mailer`;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await fetch(url, {
      method: "POST",
      headers: anon ? { Authorization: `Bearer ${anon}` } : {},
      // ettei blokkaa navigaatiota tms.
      keepalive: true,
    });
  } catch {
    // ei saa kaataa virtaan; cron poimii sitten
  }
}

// --- Admin-uutisointi: jonota + laukaise heti ---
type AdminNewAbsenceJobPayload = {
  employee_id: string;
  start_date: string;
  end_date?: string | null;
  reason?: string | null;
};

/**
 * Kutsu TÄTÄ heti sen jälkeen kun poissaolopyyntö on luotu kantaan.
 * Esim. submit-handlerissa insertin onnistumisen jälkeen.
 */
export async function enqueueAdminNewAbsence(payload: AdminNewAbsenceJobPayload) {
  // varmistetaan, että sähköpostit on päällä ja admin-lista ei ole tyhjä
  const settings = useSettingsStore.getState().settings;
  const n = settings.notifications;
  if (!n.emailNotifications || !n.absenceRequests || (n.adminNotificationEmails ?? []).length === 0) {
    return; // ei lähetetä mitään
  }

  // työnnetään jonoihin
  const { error } = await supabase.from("mail_jobs").insert({
    type: "admin_new_absence",
    status: "queued",
    attempt_count: 0,
    payload, // { employee_id, start_date, end_date?, reason? }
  });
  if (error) {
    console.warn("[enqueueAdminNewAbsence] insert failed", error);
    return;
  }
  // laukaise mailer heti (fire-and-forget)
  triggerMailerNow().catch(() => {});
}


export async function notifyAbsenceDecision(args: {
  employeeId: string;
  status: AbsenceDecision;
  startDate: string;
  endDate?: string | null;
  adminMessage?: string;
}) {
  const { employeeId, status, startDate, endDate, adminMessage } = args;

  // Lue asetus stores­ta ilman React-koukkua
  const settings = useSettingsStore.getState().settings;
  const emailEnabled = settings?.notifications?.emailNotifications ?? true;
  if (!emailEnabled) return;

  // Hae vastaanottaja
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("email, name")
    .eq("id", employeeId)
    .single();

  if (empErr) {
    console.warn("[notifyAbsenceDecision] employee fetch error", empErr);
    return;
  }
  if (!emp?.email) {
    console.warn("[notifyAbsenceDecision] employee has no email");
    return;
  }

  const period = endDate && endDate !== startDate ? `${startDate}–${endDate}` : startDate;
  const subject =
    status === "approved"
      ? `Poissaolopyyntösi on hyväksytty (${period})`
      : `Poissaolopyyntösi on hylätty (${period})`;

  const parts: string[] = [];
  if (adminMessage?.trim()) {
    parts.push(
      status === "approved"
        ? `Viestisi vastaus:\n\n${adminMessage.trim()}\n\n`
        : `Perustelu:\n\n${adminMessage.trim()}\n\n`
    );
  }
  parts.push(
    `Hei ${emp.name ?? ""},\n\nPoissaolopyyntösi on ${status === "approved" ? "hyväksytty" : "hylätty"}.\nJakso: ${period}\n`
  );
  if (status === "declined") parts.push("\nJos tämä on virhe, ole yhteydessä esihenkilöön.\n");
  parts.push("\nTerveisin,\nSoili");

  // Lähetä sähköposti (Resend sandbox huomio: menee vain omaan osoitteeseesi kunnes domain verifioitu)
  try {
    await sendEmail({ to: emp.email, subject, text: parts.join("") });
  } catch (e) {
    console.error("[notifyAbsenceDecision] email send failed", e);
    // Älä heitä eteenpäin – hyväksyntä/hylkäys ei saa kaatua mailiin
  }

  // Kirjaa loki (valinnainen, mutta hyödyllinen)
  try {
    await supabase.from("notifications").insert({
      type: status === "approved" ? "absence_approved" : "absence_declined",
      title: status === "approved" ? "Poissaolo hyväksytty" : "Poissaolo hylätty",
      message: `${emp.name ?? ""} • ${period}`,
    });
  } catch (e) {
    console.warn("[notifyAbsenceDecision] log insert failed", e);
  }
}
