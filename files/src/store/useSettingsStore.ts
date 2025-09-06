// stores/useSettingsStore.ts
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import {
  Settings,
  SettingsSchema,
  DEFAULT_SETTINGS,
  Theme,
} from "@/lib/settingsSchema";

type State = {
  settings: Settings;

  setAll: (s: Settings) => void;
  reset: () => void;

  updateGeneral: <K extends keyof Settings["general"]>(
    key: K,
    value: Settings["general"][K]
  ) => void;

  updateAutoGen: <K extends keyof Settings["autoGeneration"]>(
    key: K,
    value: Settings["autoGeneration"][K]
  ) => void;

  updateExport: <K extends keyof Settings["export"]>(
    key: K,
    value: Settings["export"][K]
  ) => void;

  updateNotifications: <K extends keyof Settings["notifications"]>(
    key: K,
    value: Settings["notifications"][K]
  ) => void;

  updateSystem: <K extends keyof Settings["system"]>(
    key: K,
    value: Settings["system"][K]
  ) => void;

  importFromJson: (raw: unknown) =>
    | { ok: true }
    | { ok: false; error: string };

  exportToFile: () => void;
  hasHydrated: boolean;
  _setHydrated: (v: boolean) => void;
};

// ✅ OIKEA KOKOONPANO: persist(subscribeWithSelector(config), options)
export const useSettingsStore = create<State>()(
  persist(
    subscribeWithSelector<State>((set, get) => ({
      settings: DEFAULT_SETTINGS,

      setAll: (s) => set({ settings: s }),
      reset: () => set({ settings: DEFAULT_SETTINGS }),

      updateGeneral: (key, value) =>
        set((st) => ({
          settings: {
            ...st.settings,
            general: { ...st.settings.general, [key]: value },
          },
        })),

      updateAutoGen: (key, value) =>
        set((st) => ({
          settings: {
            ...st.settings,
            autoGeneration: {
              ...st.settings.autoGeneration,
              [key]: value,
            },
          },
        })),

      updateExport: (key, value) =>
        set((st) => ({
          settings: {
            ...st.settings,
            export: { ...st.settings.export, [key]: value },
          },
        })),

      updateNotifications: (key, value) =>
        set((st) => ({
          settings: {
            ...st.settings,
            notifications: {
              ...st.settings.notifications,
              [key]: value,
            },
          },
        })),

      updateSystem: (key, value) =>
        set((st) => ({
          settings: {
            ...st.settings,
            system: { ...st.settings.system, [key]: value },
          },
        })),

      importFromJson: (raw) => {
        let data: unknown = raw;
        if (typeof raw === "string") {
          try {
            data = JSON.parse(raw);
          } catch {
            return {
              ok: false as const,
              error: "Virheellinen JSON: ei voitu jäsentää.",
            };
          }
        }

        const parsed = SettingsSchema.safeParse(data);
        if (!parsed.success) {
          const msg = parsed.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");
          return { ok: false as const, error: msg };
        }

        set({ settings: parsed.data });
        return { ok: true as const };
      },

      exportToFile: () => {
        const data = JSON.stringify(get().settings, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "soili-settings.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },

      hasHydrated: false,
      _setHydrated: (v) => set({ hasHydrated: v }),

    })),
    {
      name: "soili-settings-v2",
          version: 2,
migrate: (persisted: unknown): State => {
  try {
    // jos dataa ei ole → palauta default state
    if (!persisted || typeof persisted !== "object") {
      return { settings: DEFAULT_SETTINGS, hasHydrated: false, _setHydrated: () => {}, setAll: () => {}, reset: () => {}, updateGeneral: () => {}, updateAutoGen: () => {}, updateExport: () => {}, updateNotifications: () => {}, updateSystem: () => {}, importFromJson: () => ({ ok: false, error: "not implemented" }), exportToFile: () => {} } as State;
    }

    const st = persisted as State;
    if (!st?.settings) {
      return { ...st, settings: DEFAULT_SETTINGS };
    }

    const prevNotifs: Partial<Settings["notifications"]> | undefined =
      st.settings.notifications;

    const nextNotifs: Settings["notifications"] = {
      ...prevNotifs,
      adminNotificationEmails: Array.isArray(
        prevNotifs?.adminNotificationEmails
      )
        ? prevNotifs!.adminNotificationEmails!
        : [],
      emailNotifications:
        prevNotifs?.emailNotifications ?? DEFAULT_SETTINGS.notifications.emailNotifications,
      absenceRequests:
        prevNotifs?.absenceRequests ?? DEFAULT_SETTINGS.notifications.absenceRequests,
      scheduleChanges:
        prevNotifs?.scheduleChanges ?? DEFAULT_SETTINGS.notifications.scheduleChanges,
      employeeUpdates:
        prevNotifs?.employeeUpdates ?? DEFAULT_SETTINGS.notifications.employeeUpdates,
      systemUpdates:
        prevNotifs?.systemUpdates ?? DEFAULT_SETTINGS.notifications.systemUpdates,
      dailyDigest:
        prevNotifs?.dailyDigest ?? DEFAULT_SETTINGS.notifications.dailyDigest,
      digestTime:
        prevNotifs?.digestTime ?? DEFAULT_SETTINGS.notifications.digestTime,
    };

    return {
      ...st,
      settings: {
        ...st.settings,
        notifications: nextNotifs,
      },
    };
  } catch {
    // fallback jos jotain hajoaa → default state
    return { settings: DEFAULT_SETTINGS } as State;
  }
},


      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("settings-store rehydrate failed", error);
          return;
        }
        _state?._setHydrated?.(true);
      },
    }
  )
);

// (valinnainen) teema- ja push-sivuvaikutukset:
if (typeof window !== "undefined") {
  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const prefersDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const eff = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.classList.remove("light", "dark");
    root.classList.add(eff);
  };

  applyTheme(useSettingsStore.getState().settings.general.theme);

  useSettingsStore.subscribe(
    (s) => s.settings.general.theme,
    (theme) => applyTheme(theme)
  );
}

// Apukoukku jos haluat kytkeä autosaven muualle
export function useAutoSaveConfig() {
  return useSettingsStore((s) => ({
    enabled: s.settings.general.autoSave,
    intervalSec: s.settings.general.autoSaveInterval,
  }));
}
