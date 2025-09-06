"use client";

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { Badge } from "./badge";
import { Separator } from "./separator";
import { Bell, Check, Calendar, UserPlus, Wand2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supaBaseClient";
import { toast } from "sonner";
import { requestPermissionAndSubscribe } from "@/lib/pushClient";
import { logError, logInfo } from "@/lib/logger";

// NotificationsPopover.tsx, importtien jälkeen


// korvaa koko enablePush
async function enablePush() {
  try {
    await requestPermissionAndSubscribe();
    toast.success("Push-ilmoitukset käytössä");
  } catch (e) {
    logError("notifications enablePush FAILED", e);
    toast.error("Pushin käyttöönotto epäonnistui");
  }
}


async function disablePush() {
  try {
    // Poistetaan kaikki tämän SW-rekisterin tilaukset
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
    }
    toast.success("Push-ilmoitukset poistettu käytöstä");
  } catch (e) {
    logError("notifications disablePush FAILED", e);
    toast.error("Pushin poisto epäonnistui");
  }
}


type NotiType =
  | "absence_request"
  | "absence_approved"
  | "absence_declined"
  | "employee_added"
  | "shift_auto";

type Noti = {
  id: string;
  created_at: string;
  type: NotiType;
  title: string;
  message: string;
  is_read: boolean;
};

function iconFor(type: Noti["type"]) {
  switch (type) {
    case "absence_request":
      return <AlertCircle className="w-4 h-4 text-amber-600" />;
    case "absence_approved":
      return <Check className="w-4 h-4 text-green-600" />;
    case "absence_declined":
      return <AlertCircle className="w-4 h-4 text-red-600" />;
    case "employee_added":
      return <UserPlus className="w-4 h-4 text-blue-600" />;
    case "shift_auto":
      return <Wand2 className="w-4 h-4 text-indigo-600" />;
    default:
      return <Bell className="w-4 h-4" />;
  }
}


function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "juuri äsken";
  if (m < 60) return `${m} min sitten`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h sitten`;
  const d = Math.floor(h / 24);
  return `${d} pv sitten`;
}

export default function NotificationsPopover() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Noti[]>([]);
  const unread = items.filter((n) => !n.is_read).length;


const [canWrite, setCanWrite] = React.useState(false);

  React.useEffect(() => {
    (async () => {
     const { data: sessionRes } = await supabase.auth.getSession();
     setCanWrite(!!sessionRes.session); // vain kirjautuneena saa merkitä luetuksi
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        logError("notifications initial fetch FAILED", error);
      } else {
        logInfo("notifications initial fetch OK");
        setItems((data ?? []) as Noti[]);
      }
    })();
  }, []);

    React.useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error) setItems((data ?? []) as Noti[]);
    })();
  }, [open]);


React.useEffect(() => {
  const ch = supabase
    .channel("notifications-rt")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications" },
(payload) => {
  const newRow = payload.new as Noti | null;
  if (!newRow) return;

  if (payload.eventType === "INSERT") {
    setItems((prev) => [newRow, ...prev].slice(0, 50));
  } else if (payload.eventType === "UPDATE") {
    setItems((prev) =>
      prev.map((n) => (n.id === newRow.id ? newRow : n))
    );
  }
}

    )
    .subscribe();
  return () => void supabase.removeChannel(ch);
}, []);


  async function markAllRead() {
    if (!canWrite) { toast.error("Kirjaudu sisään merkataksesi ilmoituksia luetuiksi"); return; }
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false);
    if (error) {
      logError("notifications markAllRead FAILED", error);
      toast.error("Merkintä epäonnistui");
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

 // markRead – tee optimistic päivitys vain jos klikattu
async function markRead(id: string) {
  if (!canWrite) { toast.error("Kirjaudu sisään merkataksesi ilmoituksia luetuiksi"); return; }
  setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) {
    logError("notifications markRead FAILED", error);
    toast.error("Merkintä epäonnistui");
  }
}


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 justify-center">
              {unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[420px] p-0" align="end">
        <div className="p-3 flex items-center justify-between">
          <div className="font-medium">Ilmoitukset</div>
          <div className="text-xs text-muted-foreground">{unread} lukematonta</div>
        </div>
        <Separator />
        {items.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Calendar className="w-5 h-5 opacity-60" />
            Ei ilmoituksia
          </div>
        ) : (
          <div className="max-h-[360px] overflow-auto">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`w-full text-left px-3 py-2 flex gap-2 hover:bg-accent transition ${
                  n.is_read ? "opacity-75" : ""
                }`}
              >
                <div className="mt-0.5">{iconFor(n.type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm">{n.title}</div>
                    {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-foreground inline-block" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{n.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
<Separator />
<div className="p-2 flex flex-wrap items-center justify-between gap-2">
  <Button variant="ghost" size="sm" className="shrink-0" onClick={markAllRead}>
    Merkitse kaikki luetuiksi
  </Button>
  <div className="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" className="shrink-0" onClick={enablePush}>
      Ota push käyttöön
    </Button>
    <Button variant="ghost" size="sm" className="shrink-0" onClick={disablePush}>
      Poista push
    </Button>
  </div>
</div>
      </PopoverContent>
    </Popover>
  );
}
