import { supabase } from "@/lib/supaBaseClient";
import { insertEmailQueue } from "@/lib/insertEmailQueue";
import { useSettingsStore } from "@/store/useSettingsStore";

export type AbsenceDecision = "approved" | "declined";

export async function notifyAbsenceDecision(args: {
  employeeIds: string[];
  status: AbsenceDecision;
  startDate: string;
  endDate?: string | null;
  adminMessage?: string;
}) {
  const { employeeIds, status, startDate, endDate, adminMessage } = args;

  const settings = useSettingsStore.getState().settings;
  const emailEnabled = settings?.notifications?.emailNotifications ?? true;
  if (!emailEnabled) return;

  const { data: emps, error: empErr } = await supabase
    .from("employees")
    .select("id, email, name")
    .in("id", employeeIds);

  if (empErr) {
    console.warn("[notifyAbsenceDecision] employees fetch error", empErr);
    return;
  }

  const valid = (emps ?? []).filter(e => e.email);
  if (valid.length === 0) {
    console.warn("[notifyAbsenceDecision] no employees with email found");
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
    `Hei,\n\nPoissaolopyyntösi on ${status === "approved" ? "hyväksytty" : "hylätty"}.\nJakso: ${period}\n`
  );
  if (status === "declined") parts.push("\nJos tämä on virhe, ole yhteydessä esihenkilöön.\n");
  parts.push("\nTerveisin,\nSoili");

  try {
    await insertEmailQueue({
      to: valid.map(e => e.email),
      subject,
      text: parts.join(""),
    });
  } catch (e) {
    console.error("[notifyAbsenceDecision] email send failed", e);
  }

  try {
    const rows = valid.map((e) => ({
      type: status === "approved" ? "absence_approved" : "absence_declined",
      title: status === "approved" ? "Poissaolo hyväksytty" : "Poissaolo hylätty",
      message: `${e.name ?? ""} • ${period}`,
    }));
    if (rows.length > 0) {
      await supabase.from("notifications").insert(rows);
    }
  } catch (e) {
    console.warn("[notifyAbsenceDecision] log insert failed", e);
  }
}
