// components/SettingsDialog.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Settings as SettingsIcon, Download, Upload, RotateCcw, Paintbrush, Zap, FileSpreadsheet,
  Bell, Shield, Sun, Moon, Monitor, Globe, HardDrive, Database, Trash2
} from "lucide-react";

 import { useSettingsStore } from "@/store/useSettingsStore";
 import { saveNotificationSettingsToDb } from "@/lib/settingsDb";
 import { applyTheme } from "@/lib/theme";
 import { formatMinutes } from "@/lib/timeUtils";
import type {
  Theme, Language, WeekStartDay, DateFormat
} from "@/lib/settingsSchema";

export default function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const settings = useSettingsStore((s) => s.settings);
  const updateGeneralSettings = useSettingsStore((s) => s.updateGeneral);
  const updateAutoGenerationSettings = useSettingsStore((s) => s.updateAutoGen);
  const updateExportSettings = useSettingsStore((s) => s.updateExport);
  const updateNotificationSettings = useSettingsStore((s) => s.updateNotifications);
  const updateSystemSettings = useSettingsStore((s) => s.updateSystem);
  const resetSettings = useSettingsStore((s) => s.reset);
  const importFromJson = useSettingsStore((s) => s.importFromJson);
  const exportToFile = useSettingsStore((s) => s.exportToFile);

  const handleExportSettings = () => exportToFile();

  const handleImportSettings = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      try {
        const text = await input.files[0].text();
        const json = JSON.parse(text);
        const res = importFromJson(json);
        if (!res.ok) {
          toast.error(`Virhe tiedostossa: ${res.error}`);
          return;
        }
        toast.success("Asetukset tuotu");
      } catch {
        toast.error("Tiedoston luku epäonnistui");
      }
    };
    input.click();
  };

  const handleResetSettings = () => {
    resetSettings();
    toast.success("Asetukset palautettu oletuksiin");
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Asetukset"
        >
          <SettingsIcon className="w-4 h-4" />
        </div>
      </PopoverTrigger>

      <PopoverContent className="w-[680px] p-0" align="end" sideOffset={5}>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Asetukset</h3>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleExportSettings} className="h-6 px-2 text-xs">
                <Download className="w-3 h-3 mr-1" /> Vie
              </Button>
              <Button variant="ghost" size="sm" onClick={handleImportSettings} className="h-6 px-2 text-xs">
                <Upload className="w-3 h-3 mr-1" /> Tuo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetSettings}
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Palauta
              </Button>
            </div>
          </div>
        </div>

        {/* Body */}
        <ScrollArea className="max-h-[600px]">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-5 p-1 m-2">
              <TabsTrigger value="general" className="text-xs">
                <Paintbrush className="w-3 h-3 mr-1" /> Yleiset
              </TabsTrigger>
              <TabsTrigger value="auto-generation" className="text-xs">
                <Zap className="w-3 h-3 mr-1" /> Auto-gen
              </TabsTrigger>
              <TabsTrigger value="export" className="text-xs">
                <FileSpreadsheet className="w-3 h-3 mr-1" /> Vienti
              </TabsTrigger>
              <TabsTrigger value="notifications" className="text-xs">
                <Bell className="w-3 h-3 mr-1" /> Ilmoitukset
              </TabsTrigger>
              <TabsTrigger value="system" className="text-xs">
                <Shield className="w-3 h-3 mr-1" /> Järjestelmä
              </TabsTrigger>
            </TabsList>

            {/* Yleiset */}
            <TabsContent value="general" className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Teema</Label>
                   <Select
                 value={settings.general.theme}
                 onValueChange={(v: Theme) => {
                  updateGeneralSettings("theme", v);
                  applyTheme(v);
                  }}
                 >

                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light"><div className="flex items-center gap-2"><Sun className="w-3 h-3" />Vaalea</div></SelectItem>
                      <SelectItem value="dark"><div className="flex items-center gap-2"><Moon className="w-3 h-3" />Tumma</div></SelectItem>
                      <SelectItem value="system"><div className="flex items-center gap-2"><Monitor className="w-3 h-3" />Järjestelmä</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Kieli</Label>
                  <Select
                    value={settings.general.language}
                    onValueChange={(v: Language) => updateGeneralSettings("language", v)}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fi"><div className="flex items-center gap-2"><Globe className="w-3 h-3" />Suomi</div></SelectItem>
                      <SelectItem value="en"><div className="flex items-center gap-2"><Globe className="w-3 h-3" />English</div></SelectItem>
                      <SelectItem value="sv"><div className="flex items-center gap-2"><Globe className="w-3 h-3" />Svenska</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Viikon alkupäivä</Label>
                  <Select
                    value={settings.general.weekStartDay}
                    onValueChange={(v: WeekStartDay) => updateGeneralSettings("weekStartDay", v)}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Maanantai</SelectItem>
                      <SelectItem value="sunday">Sunnuntai</SelectItem>
                    </SelectContent>
                  </Select>

                </div>
              {/* Coming soon */}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Päivämäärämuoto</Label>
                  <Select
                    value={settings.general.dateFormat}
                    onValueChange={(v: DateFormat) => updateGeneralSettings("dateFormat", v)}
                  >
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd.mm.yyyy">PP.KK.VVVV</SelectItem>
                      <SelectItem value="mm/dd/yyyy">KK/PP/VVVV</SelectItem>
                      <SelectItem value="yyyy-mm-dd">VVVV-KK-PP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            {/* Oletusaikajakso poistettu MVP:stä */}
              </div>


            </TabsContent>

            {/* Auto-gen */}
            <TabsContent value="auto-generation" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Oletuskesto: {formatMinutes(settings.autoGeneration.defaultMinutes)}
                </Label>
                <Slider
                  value={[settings.autoGeneration.defaultMinutes]}
                  onValueChange={([v]) => updateAutoGenerationSettings("defaultMinutes", v)}
                  min={1}
                  max={720}
                  step={15}
                />
                <p className="text-xs text-muted-foreground">
                  Automaattisesti luodut vuorot käyttävät tätä oletuskestoa (minuutteina)
                </p>
              </div>

              <Separator />

              {([
                ["Jaa vuorot tasaisesti", "Jakaa vuorot mahdollisimman tasaisesti", "distributeEvenly"],
                ["Noudata työaikoja", "Luo vuoroja vain työaikojen sisällä", "respectWorkingHours"],
                ["Ohita viikonloput", "Älä luo vuoroja lauantaille ja sunnuntaille", "skipWeekends"],
                ["Ohita pyhäpäivät", "Älä luo vuoroja merkityille pyhäpäiville", "skipHolidays"],
              ] as const).map(([title, subtitle, key]) => (
                <div className="flex items-center justify-between" key={key}>
                  <div>
                    <Label className="text-sm font-medium">{title}</Label>
                    <p className="text-xs text-muted-foreground">{subtitle}</p>
                  </div>
                  <Switch
                    checked={settings.autoGeneration[key]}
                    onCheckedChange={(c) => updateAutoGenerationSettings(key, c)}
                  />
                </div>
              ))}

            </TabsContent>

            {/* Vienti */}
            <TabsContent value="export" className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Yrityksen nimi</Label>
                <Input
                  value={settings.export.companyName}
                  onChange={(e) => updateExportSettings("companyName", e.target.value)}
                  placeholder="Yritys Oy"
                  className="h-8"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Sisällytä Excel-vientiin</Label>
                {([
                  ["Työntekijöiden nimet", "includeNames"],
                  ["Sähköpostiosoitteet", "includeEmails"],
                  ["Osastotiedot", "includeDepartments"],
                  ["Ei-aktiiviset työntekijät", "includeInactiveEmployees"],
                  ["Tyhjät vuorot", "includeEmptyShifts"],
                  ["Tuntisummat", "includeHourTotals"],
                ] as const).map(([label, key]) => (
                  <div className="flex items-center justify-between" key={key}>
                    <Label className="text-sm">{label}</Label>
                    <Switch
                      checked={settings.export[key]}
                      onCheckedChange={(c) => updateExportSettings(key, c)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Ilmoitukset */}
            <TabsContent value="notifications" className="p-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Sähköposti-ilmoitukset</Label>
                  <Switch
                    checked={settings.notifications.emailNotifications}
                    onCheckedChange={(c) => updateNotificationSettings("emailNotifications", c)}
                  />
                </div>
                <div className="space-y-2 pl-1">
                  <Label className="text-sm font-medium">Admin-sähköpostit</Label>
                  <Input
                    placeholder="esim. admin@firma.fi, toinen@firma.fi"
                    value={(settings.notifications.adminNotificationEmails ?? []).join(", ")}
                    onChange={(e) => {
                      const emails = e.currentTarget.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      updateNotificationSettings("adminNotificationEmails", emails);
                    }}
                    className="h-8"
                  />
                  {(!settings.notifications.adminNotificationEmails ||
                    settings.notifications.adminNotificationEmails.length === 0) && (
                    <p className="text-xs text-amber-600">
                      Vinkki: lisää vähintään yksi osoite, muuten ilmoitusta ei lähetetä.
                    </p>
                  )}
                </div>
              </div>
              <Separator />



              <div className="space-y-2">
                <Label className="text-sm font-medium">Ilmoitussisältö</Label>
                {([
                  ["Poissaolopyynnöt", "absenceRequests"],
                  ["Vuoromuutokset", "scheduleChanges"],
                  ["Työntekijämuutokset", "employeeUpdates"],
                  ["Järjestelmäpäivitykset", "systemUpdates"],
                ] as const).map(([label, key]) => (
                  <div className="flex items-center justify-between" key={key}>
                    <Label className="text-sm">{label}</Label>
                    <Switch
                      checked={settings.notifications[key]}
                      onCheckedChange={(c) => updateNotificationSettings(key, c)}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Päivittäinen yhteenveto</Label>
                    <p className="text-xs text-muted-foreground">Lähetä päivittäin yhteenveto</p>
                  </div>
                  <Switch
                    checked={settings.notifications.dailyDigest}
                    onCheckedChange={(c) => updateNotificationSettings("dailyDigest", c)}
                  />
                </div>

                {settings.notifications.dailyDigest && (
                  <div className="space-y-2">
                    <Label className="text-sm">Lähetysaika</Label>
                    <Input
                      type="time"
                      value={settings.notifications.digestTime}
                      onChange={(e) => updateNotificationSettings("digestTime", e.target.value)}
                      className="h-8 w-32"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Järjestelmä */}
            <TabsContent value="system" className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Versio:</span>
                  <span>{settings.system.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Viimeisin varmuuskopio:</span>
                  <span>{settings.system.lastBackup || "Ei koskaan"}</span>
                </div>
              </div>

              <Separator />

              {([
                ["Huoltotila", "Estä muiden käyttäjien pääsy", "maintenanceMode"],
                ["Debug-tila", "Näytä kehittäjätiedot", "debugMode"],
              ] as const).map(([title, sub, key]) => (
                <div className="flex items-center justify-between" key={key}>
                  <div>
                    <Label className="text-sm font-medium">{title}</Label>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                  <Switch
                    checked={settings.system[key]}
                    onCheckedChange={(c) => updateSystemSettings(key, c)}
                  />
                </div>
              ))}

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Max työntekijöitä</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={settings.system.maxEmployees}
                    onChange={(e) => updateSystemSettings("maxEmployees", Number(e.target.value) || 100)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Datan säilytysaika (pv)</Label>
                  <Input
                    type="number"
                    min={30}
                    max={3650}
                    value={settings.system.dataRetentionDays}
                    onChange={(e) => updateSystemSettings("dataRetentionDays", Number(e.target.value) || 365)}
                    className="h-8"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="justify-start">
                  <HardDrive className="w-3 h-3 mr-2" /> Luo varmuuskopio
                </Button>
                <Button variant="outline" size="sm" className="justify-start">
                  <Database className="w-3 h-3 mr-2" /> Puhdista välimuisti
                </Button>
                <Button variant="outline" size="sm" className="justify-start">
                  <Download className="w-3 h-3 mr-2" /> Lataa lokit
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-destructive hover:text-destructive">
                  <Trash2 className="w-3 h-3 mr-2" /> Tyhjennä data
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>

{/* Footer */}
<div className="p-4 border-t border-border">
  <div className="flex justify-between items-center">
    <p className="text-xs text-muted-foreground">
      Asetukset tallennetaan automaattisesti
    </p>
    <Button
      size="sm"
      onClick={async () => {
        try {
          await saveNotificationSettingsToDb(
            useSettingsStore.getState().settings.notifications
          );
          toast.success("Asetukset tallennettu");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[app_settings upsert failed]", msg);
          toast.error(`Asetusten tallennus DB:hen epäonnistui: ${msg}`);
        } finally {
          setIsOpen(false);
        }
      }}
    >
      Valmis
    </Button>
  </div>
</div>
      </PopoverContent>
    </Popover>
  );
}
