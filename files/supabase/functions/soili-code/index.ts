// supabase/functions/soili-code/index.ts
// Ei ulkoisia importteja → toimii myös ilman deno.landia.



type Manifest = { files: { path: string; size: number; binary?: boolean }[] };

const ACTIONS_TOKEN = Deno.env.get("ACTIONS_TOKEN") || ""; // aseta supabase secretsiin
console.log("CONFIG ACTIONS_TOKEN", ACTIONS_TOKEN ? "[set]" : "[missing]");

const PROJECT_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://chatgpt.com").split(",");
const RAW_BASE =
  Deno.env.get("RAW_BASE") ||
  "https://raw.githubusercontent.com/serlaoravainen/tuukka-chat-exports/main/files/";
const MANIFEST_URL =
  Deno.env.get("MANIFEST_URL") ||
  "https://raw.githubusercontent.com/serlaoravainen/tuukka-chat-exports/main/code-index.json";
const MAX_BYTES = parseInt(Deno.env.get("MAX_BYTES") || "65536", 10); // 64 KiB max palautus kerralla


function corsHeaders(origin: string | null) {
  const allowed = origin && PROJECT_ORIGINS.includes(origin) ? origin : PROJECT_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    // pienaakkosin + supabasen yleiset: authorization, content-type, x-client-info, apikey
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}
function json(data: unknown, origin: string | null, status = 200) {
  // lisää automaattisesti approved:true kaikkiin vastauksiin
  const payload =
    typeof data === "object" && data !== null
      ? { ...(data as Record<string, unknown>), approved: true }
      : { value: data, approved: true };

  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}
function unauthorized(origin: string | null, code = 401, msg = "unauthorized") {
  return json({ error: msg }, origin, code);
}

async function loadManifest(): Promise<Manifest> {
  const r = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
  return (await r.json()) as Manifest;
}
async function loadAllowlist(): Promise<Set<string>> {
  const m = await loadManifest();
  return new Set(m.files.filter(f => !f.binary && f.size > 0).map(f => f.path));
}

async function fetchText(path: string): Promise<{ text: string; length: number }> {
  const url = RAW_BASE + path;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  // Dekoodaa turvallisesti UTF-8:na. (OK kooditiedostoille.)
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  return { text, length: text.length };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  const rawPath = url.pathname;
  const path = rawPath.startsWith("/soili-code")
    ? rawPath.slice("/soili-code".length) || "/"
    : rawPath;
  console.log("EDGE START", req.method, rawPath, "→", path);
  console.log("  query:", url.searchParams.toString());
  console.log("  auth header:", req.headers.get("authorization"));
  console.log("  x-actions-[REDACTED]x-actions-token"));
 

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders(origin) });
  }

  // Auth: hyväksy mikä tahansa näistä:
  // 1) Authorization: Bearer <ACTIONS_TOKEN>
  // 2) x-actions-token: <ACTIONS_TOKEN>
  // 3) ?token=<ACTIONS_TOKEN> (helpottaa builderin Testiä jos se sekoilee)
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = (req.headers.get("x-actions-token") || "").trim();
  const queryToken = (url.searchParams.get("token") || "").trim();
  const presented = bearer || headerToken || queryToken;
   if (!ACTIONS_TOKEN) {
    return json({ error: "server misconfigured: ACTIONS_TOKEN missing" }, origin, 500);
  }
  // DEBUG: salli anonyymit pyynnöt ilman tokenia
  if (!presented) {
    console.log("DEBUG auth bypass for connector, no token presented");
  } else if (presented !== ACTIONS_TOKEN) {
    console.log("Auth mismatch:", presented, "expected", ACTIONS_TOKEN);
    return unauthorized(origin, 403, "forbidden");
  }

  // ROUTES
  // 1) Health
if (req.method === "GET" && path === "/health") {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

  // 2) Manifest (palautetaan sellaisenaan, jotta GPT voi selata)
  if (req.method === "GET" && path === "/repo/manifest") {
    try {
      const m = await loadManifest();
      return json(m, origin);
    } catch (e) {
      return json({ error: `manifest error: ${(e as Error).message}` }, origin, 502);
    }
  }

  // 3) List files (dir + depth)
  if (req.method === "GET" && path === "/files/list") {
    const dir = (url.searchParams.get("dir") || "").replace(/^\/*/, ""); // poista johtavat kauttaviivat
    const depth = Math.min(Math.max(parseInt(url.searchParams.get("depth") || "1", 10), 0), 5);
    try {
      const m = await loadManifest();
      const out: string[] = [];
      for (const f of m.files) {
        if (f.binary || f.size <= 0) continue;
        if (dir && !f.path.startsWith(dir)) continue;
        if (dir) {
          const rel = f.path.slice(dir.length).replace(/^\/*/, "");
          const d = rel.split("/").length - 1;
          if (d > depth) continue;
        }
        out.push(f.path);
      }
      return json({ files: out }, origin);
    } catch (e) {
      return json({ error: `list error: ${(e as Error).message}` }, origin, 502);
    }
  }

// 4) Get whole file → pakotetaan käyttämään getChunkia
if (req.method === "GET" && (path === "/files/get" || path === "/code/get")) {
  console.log("DEBUG blocking /files/get, please use getChunk instead");
  return json({ error: "please use getChunk instead" }, origin, 400);
}

// PROXY: /proxy/getChunk?path=...&offset=...&length=...
if (req.method === "GET" && path === "/proxy/getChunk") {
  const p = url.searchParams.get("path") || "";
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
  let requested = Math.max(parseInt(url.searchParams.get("length") || "2000", 10), 1);
  if (requested > 8000) requested = 8000;

  try {
    const { text, length: total } = await fetchText(p);
    if (offset >= total) {
      return new Response("", { status: 200, headers: corsHeaders(origin) });
    }
    const end = Math.min(offset + requested, total);
    const slice = text.slice(offset, end);
    // Palautetaan vain raakasisältö
    return new Response(slice, {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "text/plain" },
    });
  } catch (e) {
    return new Response(`fetch error: ${(e as Error).message}`, {
      status: 502,
      headers: corsHeaders(origin),
    });
  }
}

// GET /files/getChunk?path=...&offset=...&length=...
if (req.method === "GET" && path === "/files/getChunk") {
  const p = url.searchParams.get("path") || "";
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
  let requested = Math.max(parseInt(url.searchParams.get("length") || String(MAX_BYTES), 10), 1);
  if (requested > 8000) {
    console.log("WARN getChunk length too big, capping", { requested });
    requested = 8000;
  }
  if (!p) return json({ error: "missing path" }, origin, 400);

  try {
    const list = await loadAllowlist();
    if (!list.has(p)) return json({ error: "path not allowed" }, origin, 403);
  } catch (e) {
    return json({ error: `manifest error: ${(e as Error).message}` }, origin, 502);
  }

  try {
    const { text, length: total } = await fetchText(p);
    if (offset >= total) {
      return json({ content: "", approved: true }, origin, 416);
    }
    const end = Math.min(offset + requested, total);
    const slice = text.slice(offset, end);
    console.log("RETURNING getChunk SIMPLIFIED", { p, offset, requested, sliceLength: slice.length });
    // Palautetaan vain content + approved
    return json({ content: slice, approved: true }, origin);
  } catch (e) {
    return json({ content: "", approved: true, error: `fetch error: ${(e as Error).message}` }, origin, 502);
  }
}

// PROXY: /proxy/get?path=...
if (req.method === "GET" && path === "/proxy/get") {
  const p = url.searchParams.get("path") || "";
  try {
    const { text, length: total } = await fetchText(p);
    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "text/plain" },
    });
  } catch (e) {
    return new Response(`fetch error: ${(e as Error).message}`, {
      status: 502,
      headers: corsHeaders(origin),
    });
  }
}


  // Fallback
  return json({ error: "not found" }, origin, 404);
});