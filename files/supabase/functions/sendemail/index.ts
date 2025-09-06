// supabase/functions/sendemail/index.ts
// Deno + Supabase Edge Function + Resend
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@3";
import { z } from "npm:zod@3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") ?? "");
const FROM = Deno.env.get("FROM_EMAIL") ?? "Soili <onboarding@resend.dev>";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

// Salli vain POST + CORS preflight
function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGIN !== "*" ? ALLOWED_ORIGIN : "*";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const BodySchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).nonempty()]),
  subject: z.string().min(1),
  // vähintään toinen: text tai html
  text: z.string().optional(),
  html: z.string().optional(),
  replyTo: z.string().email().optional(),
  // kevyt anti-spam kenttä (honeypot)
  _honey: z.string().optional(),
});

type ResendError = {
  name?: string;
  message?: string;
  statusCode?: number;
  [key: string]: unknown;
};


Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("Origin")) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", ...corsHeaders(req.headers.get("Origin")) },
    });
  }

  try {
    const origin = req.headers.get("Origin");
    const headers = { "content-type": "application/json", ...corsHeaders(origin) };

    // **Supabase Functions vaatii Authorization: Bearer <anon|service key>**
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization Bearer token" }), {
        status: 401,
        headers,
      });
    }

    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid body", details: parsed.error.flatten() }), {
        status: 400,
        headers,
      });
    }

    const { to, subject, text, html, replyTo, _honey } = parsed.data;

    // honeypot – jos botti täyttää, dropataan
    if (_honey && _honey.trim() !== "") {
      return new Response(JSON.stringify({ ok: true, dropped: true }), { status: 200, headers });
    }

    if (!text && !html) {
      return new Response(JSON.stringify({ error: "Provide 'text' or 'html'" }), {
        status: 400,
        headers,
      });
    }

    type ResendSendResponse = {
    id?: string;
    error?: {
    name?: string;
    message?: string;
    statusCode?: number;
    [key: string]: unknown;
    } | string | null;
    [key: string]: unknown;
    };

const sendRes = (await resend.emails.send({
  from: FROM,
  to,
  subject,
  text: text ?? undefined,
  html: html ?? undefined,
  reply_to: replyTo,
})) as ResendSendResponse;

if (sendRes.error) {
  const err: ResendError =
    typeof sendRes.error === "string"
      ? { message: sendRes.error }
      : (sendRes.error ?? {});

  const status =
    typeof err.statusCode === "number" &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 400;

  return new Response(
    JSON.stringify({
      error: {
        name: err.name ?? "ResendError",
        message: err.message ?? "Resend rejected the request",
        statusCode: status,
      },
      hint:
        "Check RESEND_API_KEY, FROM_EMAIL (sandbox vs. verified domain), and recipient.",
    }),
    { status, headers }
  );
}


    return new Response(JSON.stringify({ ok: true, data: sendRes }), { status: 200, headers });
} catch (e: unknown) {
  return new Response(
    JSON.stringify({ error: "Internal error", details: String(e) }),
    { status: 500, headers: { "content-type": "application/json", ...corsHeaders(req.headers.get("Origin")) } }
  );
}
});
