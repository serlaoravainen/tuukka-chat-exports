// src/lib/settingsDb.ts
import type { Settings } from "@/lib/settingsSchema";


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
 const FN_URL = `${resolveFunctionsBase()}/app_settings`;

 async function getAuthToken(): Promise<string | undefined> {
   // Next.js clientissä: hae token supabasen kautta
   try {
     const { createClient } = await import("@supabase/supabase-js");
     const supabase = createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
     );
     const { data: { session } } = await supabase.auth.getSession();
     return session?.access_token;
   } catch {
     return undefined;
   }
 }

export async function saveNotificationSettingsToDb(notifs: Settings["notifications"]) {
  if (typeof window !== "undefined") console.log("[app_settings] FN_URL:", FN_URL);
   const token = await getAuthToken();
   const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   const res = await fetch(FN_URL, {
     method: "PUT",
     mode: "cors",
     headers: {
       "content-type": "application/json",
       ...(token || anon ? { Authorization: `Bearer ${token ?? anon}` } : {}),
     },
     body: JSON.stringify({ notifications: notifs }),
   });
   if (!res.ok) {
     const j = await res.json().catch(() => ({}));
     throw new Error(j?.error ?? `Failed to save settings (${res.status})`);
   }
}
 export async function loadNotificationSettingsFromDb():
   Promise<Settings["notifications"]> {
   const token = await getAuthToken();
   const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   const res = await fetch(FN_URL, {
     method: "GET",
     headers: { ...(token || anon ? { Authorization: `Bearer ${token ?? anon}` } : {}) },
   });
   if (!res.ok) {
     const j = await res.json().catch(() => ({}));
     throw new Error(j?.error ?? `Failed to load settings (${res.status})`);
   }
   const j = await res.json();
   return j.notifications as Settings["notifications"];
 }