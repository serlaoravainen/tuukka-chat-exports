import { supabase } from "@/lib/supaBaseClient";

type EmailJob = {
  to: string | string[];
  subject: string;
  text: string;
};

/**
 * Lisää sähköpostin jonoon. 
 * TÄTÄ käytetään sendEmail:n sijasta frontissa / notify.ts:ssä.
 */
export async function insertEmailQueue(job: EmailJob) {
  const recipients = Array.isArray(job.to) ? job.to : [job.to];

  const { error } = await supabase.from("email_queue").insert(
    recipients.map((r) => ({
      recipient: r,
      subject: job.subject,
      body: job.text,
    }))
  );

  if (error) {
    console.error("[insertEmailQueue] failed", error);
    throw error;
  }
}
