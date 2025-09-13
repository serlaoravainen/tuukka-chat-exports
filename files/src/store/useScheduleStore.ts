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
  minutes: number | null; // tallennetaan aina kokonaisminuuteissa (esim. 255 = 4h15m)
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
  minutes: number | null; // null => poista, >0 => upsert "normal"
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
  saving: boolean;  // <-- tämä

  // Toiminnot
  hydrate: (payload: {
    employees: Employee[];
    dates: DateCell[];
    shifts: ShiftRow[];
  }) => void;

  applyCellChange: (p: { employee_id: string; work_date: string; minutes: number | null }) => void;

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

// Normalisoi päivämäärä aina YYYY-MM-DD muotoon
function normalizeDate(dateStr: string) {
  if (!dateStr) return dateStr;
  return dateStr.slice(0, 10);
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
    saving: false,
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
          minutes: s.minutes, // null pysyy nullina
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

applyCellChange: ({ employee_id, work_date, minutes }) => {
  const m = typeof minutes === "number" ? minutes : null;
  const dateISO = normalizeDate(work_date);
  const k = keyOf(employee_id, dateISO);
  const { shiftsMap, pending, undoStack } = get();

  const prev = shiftsMap[k];
  const nextMap = { ...shiftsMap };
  const nextPending = { ...pending };

if (minutes === null || minutes <= 0) {
  delete nextMap[k]; 
  nextPending[k] = { employee_id, work_date: dateISO, minutes: null }; // merkkaa poisto pendingiin
} else {
  nextMap[k] = {
    employee_id,
    work_date: dateISO,
    type: "normal",
    minutes,
  };
  nextPending[k] = { employee_id, work_date: dateISO, minutes };
}


  set({
    shiftsMap: nextMap,
    pending: nextPending,
    undoStack: [...undoStack, { employee_id, work_date, minutes: prev?.minutes ?? 0 }],
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
  if (get().saving) {
    console.log("SaveAll already running");
    return;
  }

  set({ saving: true });

  try {
    while (true) {
      const { pending } = get();
      const changes = Object.entries(pending);
      if (!changes.length) break;

      const upserts: ShiftRow[] = [];
      const deletes: { employee_id: string; work_date: string }[] = [];

      // kerätään tämän batchin rivit
      const batchKeys: string[] = [];

      for (const [key, c] of changes) {
        batchKeys.push(key);

        const dateISO = new Date(normalizeDate(c.work_date))
          .toISOString()
          .slice(0, 10);

        if (c.minutes === null || c.minutes <= 0) {
          deletes.push({ employee_id: c.employee_id, work_date: dateISO });
        } else {
          upserts.push({
            employee_id: c.employee_id,
            work_date: dateISO,
            type: "normal",
            minutes: c.minutes,
          });
        }
      }

      console.log("SAVEALL BULK DEBUG", { deletes, upserts });

      const { error } = await supabase.rpc("save_shifts_bulk", {
        _deletes: deletes,
        _upserts: upserts,
      });
      if (error) throw error;

      // ✅ poista käsitellyt rivit pendingistä
      set((state) => {
        const nextPending = { ...state.pending };
        for (const k of batchKeys) {
          delete nextPending[k];
        }
        return { pending: nextPending, dirty: Object.keys(nextPending).length > 0 };
      });
    }

    toast.success("Tallennettu");
  } catch (e) {
    console.error("saveAll error:", e);
    toast.error("Tallennus epäonnistui");
  } finally {
    set({ saving: false });
  }
},




publishShifts: async () => {
  try {
    await get().saveAll();

    const { startDateISO, days } = get();
    const endDate = new Date(startDateISO);
    endDate.setDate(endDate.getDate() + days - 1);
    const endISO = endDate.toISOString().slice(0, 10);

    const { error } = await supabase.rpc("publish_shifts_instant", {
      _start_date: startDateISO,
      _end_date: endISO,
    });
    if (error) throw error;

    set({ publishStatus: "sent" });
    toast.success("Vuorot julkaistu ja lähetetty heti!");
  } catch (e) {
    console.error("publishShifts error:", e);
    toast.error("Julkaisu epäonnistui");
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
        if (last.minutes === null || last.minutes <= 0) {
        delete nextMap[k];
      } else {
        nextMap[k] = {
          employee_id: last.employee_id,
          work_date: last.work_date,
          type: "normal",
          minutes: last.minutes,
        };
      }

      // Päivitä pending vastaamaan undo-tilaa
      const nextPending = { ...pending, [k]: { employee_id: last.employee_id, work_date: last.work_date, minutes: last.minutes } };

      // Siirrä nykyinen tila redo-pinon itemiksi
      const redoItem: PendingChange = {
        employee_id: last.employee_id,
        work_date: last.work_date,
        minutes: current?.minutes ?? null,
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
      if (next.minutes === null || next.minutes <= 0) {
        delete nextMap[k];
      } else {
        nextMap[k] = {
          employee_id: next.employee_id,
          work_date: next.work_date,
          type: "normal",
          minutes: next.minutes,
        };
      }

      const nextPending = { ...pending, [k]: { ...next } };

      set({
        shiftsMap: nextMap,
        pending: nextPending,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, { employee_id: next.employee_id, work_date: next.work_date, minutes: prev?.minutes ?? 0 }],
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

