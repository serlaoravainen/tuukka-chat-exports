// src/lib/pushClient.ts
import { supabase } from "@/lib/supaBaseClient";

const PUBLIC_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker ei tuettu");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

export async function requestPermissionAndSubscribe(): Promise<boolean> {
  if (!PUBLIC_VAPID) { console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY puuttuu"); return false; }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;

  const reg = await ensureServiceWorker();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID),
  });

  // talleta supabaseen
const json: PushSubscriptionJSON = sub.toJSON();
const endpoint: string = json.endpoint!;
const p256dh: string | undefined = json.keys?.p256dh;
const auth: string | undefined = json.keys?.auth;

const { error } = await supabase
  .from("push_subscriptions")
  .upsert({ endpoint, p256dh, auth, is_active: true }, { onConflict: "endpoint" });

if (error) {
  console.error(error);
  return false;
}
return true;

}
