"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Calendar, Clock, Users, AlertCircle, Lock, Plane, Plus, Filter } from "lucide-react";
import { ShiftType, Employee, DateInfo } from "../types";
import { supabase } from "@/lib/supaBaseClient";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useScheduleStore } from "@/store/useScheduleStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { alignToWeekStart } from "@/lib/dateUtils";
import { logError, logInfo } from "@/lib/logger";


type DateCell = DateInfo & { iso: string };

        type EmployeeRow = {
          id: string;
          name: string;
          email: string;
          department: string;
          is_active: boolean;
        };

        type AbsenceRow = {
  employee_id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  status: "pending" | "approved" | "declined";
};



interface ScheduleTableProps {
  employees?: Employee[]; // säilytetään signatuuri
}


function addDaysISO(iso: string, add: number) {
  // "T00:00:00" poistaa aikavyöhykkeen heiton
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

function fiWeekdayShort(d: Date) {
  // su-to klo 0 locale -> FI näyttää ma, ti, ke...
  return d
    .toLocaleDateString("fi-FI", { weekday: "short" })
    .replace(".", "")
    .toUpperCase()
    .slice(0, 2);
}

 function fiDayMonth(d: Date) {
   const day = d.getDate();
   const month = d.getMonth() + 1;
   return `${day}.${month}`;
 }

// 🆕 FI-normalisointi (lowercase + diakriittien poisto)
function normalizeFi(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

 const DEFAULT_FILTERS = {
  departments: [] as string[],
  showActive: false,
  showInactive: false,
  searchTerm: "",
}


const ScheduleTable: React.FC<ScheduleTableProps> = () => {

const startISO = useScheduleStore((s) => s.startDateISO);
const days = useScheduleStore((s) => s.days);
const weekStartDay = useSettingsStore((s) => s.settings.general.weekStartDay);

const alignedStart = useMemo(
  () => alignToWeekStart(startISO, weekStartDay),
  [startISO, weekStartDay]
);



const shiftsMap = useScheduleStore((s) => s.shiftsMap) ?? {};
const filters = useScheduleStore((s) => s.filters) ?? DEFAULT_FILTERS;

//tila-filtteri on aktiivinen, jos vain toinen on päällä
const stateFilterActive = filters.showActive !== filters.showInactive;

const employees = useScheduleStore(s => s.employees);
const filteredEmployees = useMemo(() => {
  const term = normalizeFi((filters.searchTerm ?? "").trim());
  return employees.filter((emp) => {
    // department
    if (filters.departments.length > 0 && !filters.departments.includes(emp.department)) {
      return false;
    }
    // active/inactive XOR
    if (stateFilterActive) {
      if (filters.showActive && !emp.isActive) return false;
      if (filters.showInactive && emp.isActive) return false;
    }
    // search (nimi + email + osasto)
    if (term.length > 0) {
      const hay =
        normalizeFi(emp.name) +
        " " +
        normalizeFi(emp.email) +
        " " +
        normalizeFi(emp.department);
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}, [employees, filters, stateFilterActive]);
  
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ employee: string; day: number } | null>(null);
  const [openPopover, setOpenPopover] = useState<string | null>(null);




  // Päivärivi tuotetaan ISO:sta -> näyttää täsmälleen sun UI:n kaltaisen otsikon
const dates: DateCell[] = useMemo(() => {
  return Array.from({ length: days }).map((_, i): DateCell => {
    const iso = addDaysISO(alignedStart, i);
    const d = new Date(iso + "T00:00:00Z");
    return { 
      day: fiWeekdayShort(d), 
      date: fiDayMonth(d), 
      iso,
      fullDate: d // 👈 tämä puuttui
    };
  });
}, [alignedStart, days]);

  // Alignaa heti mountissa ja aina kun viikon aloituspäivä muuttuu,
  // jotta näkymä on johdonmukainen myös ilman Toolbarin efektiä.


  // Vuorot mapattuna: key = `${employee_id}|${work_date}`
  

// 1) Hae työntekijät + 2) hae vuorot valitulle jaksolle
useEffect(() => {
  (async () => {
    try {
      setLoading(true);
      // Employees
      const { data: empData, error: empErr } = await supabase
        .from("employees")
        .select("id, name, email, department, is_active, created_at")
        .order("created_at", { ascending: true });
      if (empErr) throw empErr;

      const mappedEmp: Employee[] = (empData ?? []).map((row: EmployeeRow) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        department: row.department,
        isActive: !!row.is_active,
        shifts: [] as ShiftType[],
      }));

      const { data: s, error: sErr } = await supabase
        .from("shifts")
        .select("employee_id, work_date, type, minutes")
        .gte("work_date", dates[0].iso)
        .lte("work_date", dates[dates.length - 1].iso)
        .in("employee_id", mappedEmp.map((e) => e.id));
      if (sErr) throw sErr;

      useScheduleStore.getState().hydrate({
        employees: mappedEmp,
        dates,
        shifts: (s ?? []).map((r) => ({
          employee_id: r.employee_id,
          work_date: r.work_date,
          type: r.type as "normal" | "locked" | "absent" | "holiday",
          minutes: r.minutes ?? 0,
        })),
      });

      const { data: abs, error: absErr } = await supabase
        .from("absences")
        .select("employee_id, start_date, end_date, reason, status")
        .eq("status", "approved")
        .in("employee_id", mappedEmp.map((e) => e.id));
      if (absErr) throw absErr;

      const absMap: Record<string, { type: "absent" | "holiday"; reason: string }> = {};
      (abs ?? []).forEach((a: AbsenceRow) => {
        const start = new Date(a.start_date);
        const end = a.end_date ? new Date(a.end_date) : start;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const iso = d.toISOString().slice(0, 10);
          absMap[`${a.employee_id}|${iso}`] = {
            type: a.reason?.toLowerCase() === "holiday" ? "holiday" : "absent",
            reason: a.reason ?? "",
          };
        }
      });
      setAbsencesMap(absMap);
      logInfo("ScheduleTable initial fetch OK");
    } catch (e) {
      logError("ScheduleTable initial fetch FAILED", e);
      toast.error("Tietojen haku epäonnistui");
    } finally {
      setLoading(false);
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [startISO, days]);



const [absencesMap, setAbsencesMap] = useState<Record<string, { type: "absent" | "holiday"; reason: string }>>({});

  // Lue solun vuoro mapista
function getShift(empId: string, dayIndex: number): ShiftType {
  const iso = dates[dayIndex].iso;
  const key = `${empId}|${iso}`;
  const row = shiftsMap[key];
  if (!row) return { type: "empty" };                 // UI-fallback
  if (row.type === "normal" || row.type === "locked") {
    return { type: row.type, minutes: row.minutes ?? 0 };
  }
  return { type: row.type }; // absent/holiday
}

  // Yhteensä tunnit / työntekijä
  const getTotalHours = (employee: Employee) =>
    dates.reduce((sum, _, i) => {
      const s = getShift(employee.id, i);
      return sum + (s.minutes || 0);
    }, 0);

    function formatMinutes(total: number) {
    if (!total) return "0h";
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  // Klikkaus: toggle empty <-> normal(8h), upsert DB:hen
// ScheduleTable.tsx

const applyCellChange = useScheduleStore(s => s.applyCellChange);

function handleCellClick(employeeId: string, dayIndex: number, minutes: number | null) {
  const iso = dates[dayIndex].iso;
  applyCellChange({
    employee_id: employeeId,
    work_date: iso,
    minutes,
  });
  setSelectedCell({ employee: employeeId, day: dayIndex });
}
 // Custom input state
 const [customHours, setCustomHours] = useState<number>(0);
 const [customMinutes, setCustomMinutes] = useState<number>(0);

 function handleCustomHourSubmit(empId: string, dayIndex: number) {
   const total = (customHours ?? 0) * 60 + (customMinutes ?? 0);
   if (total > 0) {
     handleCellClick(empId, dayIndex, total);
     setCustomHours(0);
     setCustomMinutes(0);
   }
 }



  // UI-helper solun ulkoasuun
  const getShiftDisplay = (shift: ShiftType) => {
    switch (shift.type) {
      case "normal":
        return { content: formatMinutes(shift.minutes ?? 0), color: "bg-primary text-primary-foreground", icon: <Clock className="w-3 h-3" /> };
      case "locked":
        return { content: formatMinutes(shift.minutes ?? 0), color: "bg-amber-500 text-white", icon: <Lock className="w-3 h-3" /> };
      case "absent":
        return { content: "A", color: "bg-destructive text-destructive-foreground", icon: <AlertCircle className="w-3 h-3" /> };
      case "holiday":
        return { content: "H", color: "bg-blue-500 text-white", icon: <Plane className="w-3 h-3" /> };
      default:
        return { content: "", color: "bg-muted hover:bg-accent", icon: <Plus className="w-3 h-3 opacity-0 group-hover:opacity-50" /> };
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ladataan…</div>;
  }

  return (
  <div className="w-full space-y-6">
    <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-primary" />
            <CardTitle className="text-2xl text-primary">Vuorot</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1">
            <Users className="w-4 h-4 mr-2" />
            {filteredEmployees.length} työntekijää
            </Badge>
            {(filters.departments.length > 0 || stateFilterActive) && (
              <Badge variant="outline" className="px-3 py-1">
                <Filter className="w-3 h-3 mr-1" />
                Suodatettu
              </Badge>
              )}
              </div>
          </div>

      </CardHeader>
  {(filters.departments.length > 0 || stateFilterActive || (filters.searchTerm ?? "").trim()) && (
    <div className="px-6 pb-2">
      <div className="text-sm text-muted-foreground bg-accent/40 px-3 py-2 rounded-md inline-flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4" />
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {stateFilterActive && (
            <span>{filters.showActive ? "Vain aktiiviset työntekijät" : "Vain ei-aktiiviset työntekijät"}</span>
          )}
          {filters.departments.length > 0 && (
            <span>Osastot: {filters.departments.join(", ")}</span>
          )}
          {(filters.searchTerm ?? "").trim() && (
            <span>Haku: “{filters.searchTerm.trim()}”</span>
            )}
        </div>
      </div>
    </div>
  )}


      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header */}
            <div className="bg-muted/50 border-b">
              <div
              className="grid gap-px"
              style={{ gridTemplateColumns: `minmax(200px,280px) repeat(${days}, minmax(96px, 1fr))` }}
              >
                <div className="p-4 bg-background">
                  <span className="text-sm font-medium text-muted-foreground">Työntekijä</span>
                </div>
                {dates.map((date, index) => (
                  <div key={index} className="p-3 bg-background text-center">
                    <div className="text-xs font-medium text-muted-foreground">{date.day}</div>
                    <div className="text-sm font-semibold mt-1">{date.date}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Employee Rows */}
              <div className="divide-y divide-border">
              {filteredEmployees.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Ei työntekijöitä näytettäväksi nykyisillä suodattimilla</p>
                  <p className="text-sm mt-1">Muuta suodattimia nähdäksesi työntekijöitä</p>
                </div>
              ) : filteredEmployees.map((employee) => (

                <div
                  key={employee.id}
                  className="grid gap-px hover:bg-accent/30 transition-colors"
                  style={{ gridTemplateColumns: `minmax(200px,280px) repeat(${days}, minmax(96px, 1fr))` }}
                >
                  <div className="p-4 bg-background flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{employee.name}</span>
                        {!employee.isActive && (
                          <Badge variant="destructive" className="text-xs">Ei-aktiivinen</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{employee.department}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {formatMinutes(getTotalHours(employee))}
                    </Badge>
                  </div>

{dates.map((_, dayIndex) => {
  const shift = getShift(employee.id, dayIndex);
  const shiftDisplay = getShiftDisplay(shift);
  const isSelected =
    selectedCell?.employee === employee.id && selectedCell?.day === dayIndex;

  const key = `${employee.id}|${dates[dayIndex].iso}`;
  const absence = absencesMap[key];

  return (
    <Popover
  key={dayIndex}
  open={openPopover === `${employee.id}-${dayIndex}`}
  onOpenChange={(o) =>
    setOpenPopover(o ? `${employee.id}-${dayIndex}` : null)
  }
>
<PopoverTrigger asChild>
  <div
    className={`
      h-16 p-2 m-0 rounded-none border-0 group
      flex items-center justify-center
      ${isSelected ? "ring-2 ring-ring ring-offset-2" : ""}
      transition-all duration-200 hover:scale-105 hover:shadow-md
      ${
        absence
          ? absence.type === "holiday"
            ? "bg-blue-100 cursor-not-allowed"
            : "bg-red-100 cursor-not-allowed"
          : shiftDisplay.color + " cursor-pointer"
      }
    `}
    onDoubleClick={() => {
      if (!absence) {
        handleCellClick(employee.id, dayIndex, null); // poisto selkeästi
      }
    }}
  >
    <div className="flex flex-col items-center space-y-1">
      {absence ? (
        <>
          <span
            className={`text-xs font-medium ${
              absence.type === "holiday" ? "text-blue-600" : "text-red-600"
            }`}
          >
            {absence.type === "holiday" ? "L" : "A"}
          </span>
          <span className="text-[10px]">
            {absence.type === "holiday" ? "Loma" : "Poissaolo"}
          </span>
        </>
      ) : (
        <>
          {shiftDisplay.icon}
          {shiftDisplay.content && (
            <span className="text-xs font-medium">
              {shiftDisplay.content}
            </span>
          )}
        </>
      )}
    </div>
  </div>
</PopoverTrigger>


  {/* Näytä PopoverContent vain jos ei ole absence */}
{!absence && (
  <PopoverContent className="w-64 p-3 space-y-3" side="bottom" align="center">
    <div className="text-sm font-medium text-center">
      {employee.name} – {dates[dayIndex].day} {dates[dayIndex].date}
    </div>

    {/* Pikavalinnat */}
    <div className="grid grid-cols-2 gap-2">
      {[4, 6, 8].map((h) => (
        <Button
          key={h}
          variant="outline"
          size="sm"
          onClick={() => {
            handleCellClick(employee.id, dayIndex, h * 60);
            setOpenPopover(null);
          }}
          className="justify-center"
        >
          {h}h
        </Button>
      ))}
    </div>

    {/* Custom Hours + Minutes */}
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min="0"
          max="24"
          placeholder="0"
          value={customHours}
          onChange={(e) => setCustomHours(Number(e.target.value))}
          className="h-8 text-sm"
        />
        <Input
          type="number"
          min="0"
          max="59"
          step="15"
          placeholder="0"
          value={customMinutes}
          onChange={(e) => setCustomMinutes(Number(e.target.value))}
          className="h-8 text-sm"
        />
      </div>
      <Button
        size="sm"
        className="w-full h-8"
        onClick={() => {
          const total = (customHours ?? 0) * 60 + (customMinutes ?? 0);
          if (total > 0) {
            handleCellClick(employee.id, dayIndex, total);
            setOpenPopover(null);
          }
        }}
        disabled={(customHours ?? 0) + (customMinutes ?? 0) === 0}
      >
        Aseta aika
      </Button>
    </div>

    {/* Poista vuoro */}
    <div className="flex justify-center">
      <Button
        variant="destructive"
        size="sm"
        onClick={() => {
          handleCellClick(employee.id, dayIndex, null);
          setOpenPopover(null);
        }}
      >
        Poista vuoro
      </Button>
    </div>
  </PopoverContent>
)}

</Popover>

  );
})}

                </div>
              ))}
            </div>

            {/* Summary Row */}
            <div className="bg-accent/50 border-t-2 border-primary/20">
              <div
              className="grid gap-px"
              style={{ gridTemplateColumns: `minmax(200px,280px) repeat(${days}, minmax(96px, 1fr))` }}
              >

                <div className="p-4 bg-background">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      Yhteensä ({filteredEmployees.length} työntekijää)
                    </span>
                  </div>
                </div>
                {dates.map((_, dayIndex) => {
                  const dayTotal = filteredEmployees.reduce((total, emp) => {
                    const s = getShift(emp.id, dayIndex);
                    return total + (s?.minutes || 0);
                  }, 0);

                  const filledCount = filteredEmployees.filter(
                    (emp) => getShift(emp.id, dayIndex)?.type !== "empty"
                  ).length;

                  return (
                    <div key={dayIndex} className="p-3 bg-background text-center">
                      <div className="text-sm font-semibold text-primary">{formatMinutes(dayTotal)}</div>
                      <div className="text-xs text-muted-foreground">{filledCount} henkilöä</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Legend */}
    <Card className="shadow-md">
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-center justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center">
              <Clock className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
            <span className="text-sm">Normaali vuoro</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-amber-500 rounded-sm flex items-center justify-center">
              <Lock className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-sm">Lukittu vuoro</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-destructive rounded-sm flex items-center justify-center">
              <AlertCircle className="w-2.5 h-2.5 text-destructive-foreground" />
            </div>
            <span className="text-sm">Poissaolo</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
              <Plane className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-sm">Loma</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);
}

export default ScheduleTable;
