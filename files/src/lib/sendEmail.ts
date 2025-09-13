export type SendEmailPayload = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

let lastCall = 0;

export async function sendEmail(payload: SendEmailPayload) {
  // Throttlaus: max 2 kutsua / sekunti Resendiin
  const now = Date.now();
  const diff = now - lastCall;
  if (diff < 1000) {
    await new Promise((res) => setTimeout(res, 600 - diff));
  }
  lastCall = Date.now();

  const res = await fetch("/api/sendEmail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Email send failed (${res.status}) ${JSON.stringify(data)}`);
  }
  return data;
}
