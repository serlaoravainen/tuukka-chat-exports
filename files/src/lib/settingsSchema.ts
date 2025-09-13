// lib/settingsSchema.ts
import { z } from "zod";

export const themeValues = ["light", "dark", "system"] as const;
export type Theme = typeof themeValues[number];

export const languageValues = ["fi", "en", "sv"] as const;
export type Language = typeof languageValues[number];

export const weekStartValues = ["monday", "sunday"] as const;
export type WeekStartDay = typeof weekStartValues[number];

export const timeFormatValues = ["24h", "12h"] as const;
export type TimeFormat = typeof timeFormatValues[number];

export const dateFormatValues = ["dd.mm.yyyy", "mm/dd/yyyy", "yyyy-mm-dd"] as const;
export type DateFormat = typeof dateFormatValues[number];

export type TimePeriod = 7 | 10 | 14 | 30;

export const GeneralSettingsSchema = z.object({
  theme: z.enum(themeValues),
  language: z.enum(languageValues),
  weekStartDay: z.enum(weekStartValues),
  timeFormat: z.enum(timeFormatValues),
  dateFormat: z.enum(dateFormatValues),
  defaultTimePeriod: z.union([z.literal(7), z.literal(10), z.literal(14), z.literal(30)]),
  workingHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    breakDuration: z.number().int().min(0).max(240),
  }),
  autoSave: z.boolean(),
  autoSaveInterval: z.number().int().min(10).max(300),
});

export const AutoGenSettingsSchema = z.object({
  defaultMinutes: z.number().int().min(1).max(720),
  distributeEvenly: z.boolean(),
  respectWorkingHours: z.boolean(),
  skipWeekends: z.boolean(),
  skipHolidays: z.boolean(),
  maxConsecutiveDays: z.number().int().min(1).max(14),
  minRestMinutes: z.number().int().min(60).max(1440),
});

export const ExportSettingsSchema = z.object({
  companyName: z.string().max(120),
  includeNames: z.boolean(),
  includeEmails: z.boolean(),
  includeDepartments: z.boolean(),
  includeInactiveEmployees: z.boolean(),
  includeEmptyShifts: z.boolean(),
  includeHourTotals: z.boolean(),
});

export const NotificationSettingsSchema = z.object({
  emailNotifications: z.boolean(),
  adminNotificationEmails: z.array(z.string().email()).max(50).default([]),
  absenceRequests: z.boolean(),
  scheduleChanges: z.boolean(),
  employeeUpdates: z.boolean(),
  systemUpdates: z.boolean(),
  dailyDigest: z.boolean(),
  digestTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const SystemSettingsSchema = z.object({
  version: z.string(),
  lastBackup: z.string().nullable().optional(),
  maintenanceMode: z.boolean(),
  debugMode: z.boolean(),
  maxEmployees: z.number().int().min(1).max(1000),
  dataRetentionDays: z.number().int().min(30).max(3650),
});

export const SettingsSchema = z.object({
  general: GeneralSettingsSchema,
  autoGeneration: AutoGenSettingsSchema,
  export: ExportSettingsSchema,
  notifications: NotificationSettingsSchema,
  system: SystemSettingsSchema,
});

export type Settings = z.infer<typeof SettingsSchema>;

// Oletukset
export const DEFAULT_SETTINGS: Settings = {
  general: {
    theme: "light",
    language: "fi",
    weekStartDay: "monday",
    timeFormat: "24h",
    dateFormat: "dd.mm.yyyy",
    defaultTimePeriod: 30,
    workingHours: { start: "08:00", end: "17:00", breakDuration: 30 },
    autoSave: true,
    autoSaveInterval: 60,
  },
  autoGeneration: {
    defaultMinutes: 480,
    distributeEvenly: false,
    respectWorkingHours: true,
    skipWeekends: true,
    skipHolidays: false,
    maxConsecutiveDays: 5,
    minRestMinutes: 660,
  },
  export: {
    companyName: "Yritys Oy",
    includeNames: true,
    includeEmails: false,
    includeDepartments: true,
    includeInactiveEmployees: false,
    includeEmptyShifts: true,
    includeHourTotals: true,
  },
  notifications: {
    emailNotifications: true,
    absenceRequests: true,
    adminNotificationEmails: [],
    scheduleChanges: true,
    employeeUpdates: false,
    systemUpdates: false,
    dailyDigest: false,
    digestTime: "08:00",
  },
  system: {
    version: "1.0.0",
    lastBackup: null,
    maintenanceMode: false,
    debugMode: false,
    maxEmployees: 100,
    dataRetentionDays: 365,
  },
};
