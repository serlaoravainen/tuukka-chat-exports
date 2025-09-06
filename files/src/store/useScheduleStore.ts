// src/store/useScheduleStore.ts
"use client";

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import { supabase } from "@/lib/supaBaseClient";
import { persist, createJSONStorage } from "zustand/middleware";



// KÄYTÄ YHTÄ TOTUUTTA: ota tyypit yhdestä paikasta
import type { Employee, DateInfo } from "@/app/types";

// Sama DateCell kuin muualla
export type DateCell = DateInfo & { iso: string };

// Yhden solun persistomuoto
export type ShiftRow = {
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  type: "normal" | "locked" | "absent" | "holiday";
  hours: number | null; // null sallitaan, mutta tallennetaan 0:ksi kun kirjoitetaan DB:hen
};
// Suodattimien tyyppi
export type Filters = {
  departments: string[];
  showActive: boolean;
  showInactive: boolean;
  searchTerm: string;
};

// Sisäinen muutos, jota kerätään saveAll:lle
type PendingChange = {
  employee_id: string;
  work_date: string;
  hours: number; // 0 => poista, >0 => upsert "normal"
};


type State = {

  // Hydratoitu perusdata
  employees: Employee[];
  dates: DateCell[];
  

  // Vuorot mapattuna
  shiftsMap: Record<string, ShiftRow>;

  // Muutokset jotka pitää tallentaa
  pending: Record<string, PendingChange>;

  // Undo/redo pino
  undoStack: PendingChange[];
  redoStack: PendingChange[];

  // UI-signaalit
  dirty: boolean;

  // Filtterit
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;

  startDateISO: string;
  days: 7 | 10 | 14 | 30;

  setRange: (startISO: string, days: State["days"]) => void;
  setStartDate: (startDateISO: string) => void;
  shiftRange: (deltaDays: number) => void;
  hasHydrated: boolean;
  _setHydrated: (v: boolean) => void;

  // Toiminnot
  hydrate: (payload: {
    employees: Employee[];
    dates: DateCell[];
    shifts: ShiftRow[];
  }) => void;

  applyCellChange: (p: { employee_id: string; work_date: string; hours: number | null }) => void;

  saveAll: () => Promise<void>;
  publishStatus: "idle" | "pending" | "sent" | "canceled";
  publishShifts: () => Promise<void>;
  unpublishShifts: () => Promise<void>;

  undo: () => void;
  redo: () => void;
};

function keyOf(empId: string, iso: string) {
  return `${empId}|${iso}`;
}

function todayLocalISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const useScheduleStore = create<State>()(
  persist(
  devtools((set, get) => ({
    publishStatus: "idle",
    employees: [],
    dates: [],
    shiftsMap: {},
    pending: {},
    undoStack: [],
    redoStack: [],
    dirty: false,
    hasHydrated: false,
    _setHydrated: (v) => set({ hasHydrated: v }),
    
     // ---Filtterit (init + setterit juureen)---
     filters: { departments: [], showActive: false, showInactive: false, searchTerm: "" },
     setFilters: (partial) =>
       set((state) => ({ filters: { ...state.filters, ...partial } })),
     resetFilters: () =>
       set({ filters: { departments: [], showActive: false, showInactive: false, searchTerm: "" } }),

startDateISO: todayLocalISO(),
days: 10 as State["days"],

    hydrate: ({ employees, dates, shifts }) => {
      // Rakennetaan map shifteistä
      const map: Record<string, ShiftRow> = {};
      for (const s of shifts) {
        map[keyOf(s.employee_id, s.work_date)] = {
          ...s,
          hours: s.hours ?? 0,
          // Varmista että type on unionista (tai normal jos tuntematon)
          type:
            s.type === "normal" ||
            s.type === "locked" ||
            s.type === "absent" ||
            s.type === "holiday"
              ? s.type
              : "normal",
        };
      }
      set({
        employees,
        dates,
        shiftsMap: map,
        pending: {},
        undoStack: [],
        redoStack: [],
        dirty: false,
      });
    },

    applyCellChange: ({ employee_id, work_date, hours }) => {
      const h = typeof hours === "number" ? hours : 0;
      const k = keyOf(employee_id, work_date);
      const { shiftsMap, pending, undoStack } = get();

      // Laske edellinen arvo (käytetään undo:ssa)
      const prev = shiftsMap[k];

      // Päivitä live-näkymään:
      const nextMap = { ...shiftsMap };
      if (h <= 0) {
        // 0h => poista vuoro näkyvistä
        delete nextMap[k];
      } else {
        // >0h => laita normal-h vuoro
        nextMap[k] = {
          employee_id,
          work_date,
          type: "normal",
          hours: h,
        };
      }

      // Päivitä pending: 0h => merkkaa poistoksi, muuten upsertiksi
      const nextPending = { ...pending, [k]: { employee_id, work_date, hours: h } };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        undoStack: [...undoStack, { employee_id, work_date, hours: prev?.hours ?? 0 }],
        redoStack: [],
        dirty: true,
      });
    },

setRange: (startISO, days) => set({ startDateISO: startISO, days }),
setStartDate: (startDateISO: string) => set({ startDateISO }),
shiftRange: (deltaDays: number) => {
  const { startDateISO, days } = get();
  const d = new Date(startDateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  set({ startDateISO: d.toISOString().slice(0, 10), days });
},

saveAll: async () => {
  const { pending } = get();
  const changes = Object.values(pending);
  if (!changes.length) {
    toast.info("Ei tallennettavia muutoksia");
    return;
  }
  // DEBUG: tarkista mikä rooli Supabase antaa tälle clientille
  try {
    const { data: roleData, error: roleError } = await supabase.rpc("current_role");
    console.log("Supabase current_role RPC:", roleData, roleError);
  } catch (err) {
    console.error("Virhe current_role tarkistuksessa:", err);
  }

  const upserts: ShiftRow[] = [];
  const deletes: { employee_id: string; work_date: string }[] = [];

  for (const c of changes) {
    if (c.hours <= 0) {
      deletes.push({ employee_id: c.employee_id, work_date: c.work_date });
    } else {
      upserts.push({
        employee_id: c.employee_id,
        work_date: c.work_date,
        type: "normal",
        hours: c.hours ?? 0, // varmistetaan ettei mene null-arvo
      });
    }
  }

  try {
    // 1) Upsertit ensin RPC:n kautta (varmempi kuin onConflict RESTissä)
    if (upserts.length) {
      for (const row of upserts) {
        const { error } = await supabase.rpc("upsert_shifts", {
          _employee_id: row.employee_id,
          _work_date: row.work_date,
          _type: row.type,
          _hours: row.hours ?? 0,
        });
        console.log("upsert_shifts result:", row, error);
        if (error) throw error;
      }
    }

    // 2) Poistot **ilman ristiin-IN-bugia**: ryhmittele työntekijöittäin
    if (deletes.length) {
      const byEmp = new Map<string, string[]>();
      for (const d of deletes) {
        const arr = byEmp.get(d.employee_id) ?? [];
        arr.push(d.work_date);
        byEmp.set(d.employee_id, arr);
      }

      // Chunkkaa päivämääriä per employee_id, jotta IN-listat eivät kasva liikaa
      for (const [empId, dates] of byEmp.entries()) {
        const chunkSize = 1000;
        for (let i = 0; i < dates.length; i += chunkSize) {
          const sub = dates.slice(i, i + chunkSize);
          const res = await supabase
            .from("shifts")
            .delete()
            .eq("employee_id", empId)
            .in("work_date", sub);
          console.log("saveAll delete response:", res);
          if (res.error) throw res.error;
        }
      }
    }

    set({ pending: {}, dirty: false });
    toast.success("Tallennettu");
  } catch (e) {
    console.error("saveAll error:", e);
    toast.error("Tallennus epäonnistui");
    // Älä nollaa pendingiä epäonnistumisessa
  }
},
publishShifts: async () => {
  try {
    // 1. Varmista että kaikki muutokset tallessa
    await get().saveAll();

    // 2. Käytä RPC:ta joka hoitaa julkaisemisen + shift_publications -merkinnän
    const { startDateISO, days } = get();
    const endDate = new Date(startDateISO);
    endDate.setDate(endDate.getDate() + days - 1);
    const endISO = endDate.toISOString().slice(0, 10);

    const { error } = await supabase.rpc("publish_shifts", {
      _start_date: startDateISO,
      _end_date: endISO,
    });
    if (error) throw error;


  set({ publishStatus: "pending" });
  toast.success("Vuorot julkaistu! Sähköpostit lähtevät 30 minuutin viiveellä.");
  } catch (e) {
    console.error(e);
    toast.error("Julkaisu epäonnistui");
  }
},

unpublishShifts: async () => {
  try {
    const { startDateISO, days } = get();
    const endDate = new Date(startDateISO);
    endDate.setDate(endDate.getDate() + days - 1);
    const endISO = endDate.toISOString().slice(0, 10);

    const { error } = await supabase.rpc("unpublish_shifts", {
      _start_date: startDateISO,
      _end_date: endISO,
    });
    if (error) throw error;

    set({ publishStatus: "canceled" });
    toast.success("Julkaisu peruttu ja merkattu perutuksi.");
  } catch (e) {
    console.error(e);
    toast.error("Peruutus epäonnistui");
  }
},


    undo: () => {
      const { undoStack, shiftsMap, pending, redoStack } = get();
      if (!undoStack.length) return;
      const last = undoStack[undoStack.length - 1];

      const k = keyOf(last.employee_id, last.work_date);
      const current = shiftsMap[k]; // mitä on nyt UI:ssa

      // Palauta entinen tuntimäärä
      const nextMap = { ...shiftsMap };
      if (!last.hours || last.hours <= 0) {
        delete nextMap[k];
      } else {
        nextMap[k] = {
          employee_id: last.employee_id,
          work_date: last.work_date,
          type: "normal",
          hours: last.hours,
        };
      }

      // Päivitä pending vastaamaan undo-tilaa
      const nextPending = { ...pending, [k]: { employee_id: last.employee_id, work_date: last.work_date, hours: last.hours ?? 0 } };

      // Siirrä nykyinen tila redo-pinon itemiksi
      const redoItem: PendingChange = {
        employee_id: last.employee_id,
        work_date: last.work_date,
        hours: current?.hours ?? 0,
      };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, redoItem],
        dirty: true,
      });
    },

    redo: () => {
      const { redoStack, shiftsMap, pending, undoStack } = get();
      if (!redoStack.length) return;
      const next = redoStack[redoStack.length - 1];

      const k = keyOf(next.employee_id, next.work_date);
      const prev = shiftsMap[k];

      const nextMap = { ...shiftsMap };
      if (!next.hours || next.hours <= 0) {
        delete nextMap[k];
      } else {
        nextMap[k] = {
          employee_id: next.employee_id,
          work_date: next.work_date,
          type: "normal",
          hours: next.hours,
        };
      }

      const nextPending = { ...pending, [k]: { ...next } };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, { employee_id: next.employee_id, work_date: next.work_date, hours: prev?.hours ?? 0 }],
        dirty: true,
      });
    },
  })),
    {
      name: "schedule-ui", // avain localStorageen
      version: 1,
      storage:
        typeof window !== "undefined"
          ? createJSONStorage(() => localStorage)
          : undefined,
      // persistoi vain nämä (ei esim. shiftsMap tms.)
      partialize: (state) => ({
        startDateISO: state.startDateISO,
        days: state.days,
      }),
      // Kun persist-hydraus valmistuu -> merkitse valmiiksi
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("schedule-ui rehydrate failed", error);
          return;
        }
        // Ei 'set' scope:ssa -> kutsu action store-instanssin kautta
        _state?._setHydrated?.(true);
      },
  }
  )
);

