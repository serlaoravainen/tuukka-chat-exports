
import { NextRequest, NextResponse } from "next/server";

type Body = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { to, subject, text, html, replyTo } = (await req.json()) as Body;
    if (!to || !subject) {
      return NextResponse.json({ error: "Missing 'to' or 'subject'" }, { status: 400 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
    }

    const FROM = process.env.FROM_EMAIL || "Soili <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to,
        subject,
        text,
        html,
        reply_to: replyTo,
      }),
    });

    const data: Record<string, unknown> = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return NextResponse.json({ error: data || "Resend error" }, { status: resp.status });
    }
    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

