"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supaBaseClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Calendar, Clock, Users, Eye, EyeOff, AlertCircle, Lock, Plane } from 'lucide-react';
import { Employee, ShiftType, DateInfo, TimePeriod, AppSettings } from '../types';
import { formatMinutes } from "@/lib/timeUtils";



type ShiftRow = {
  id: string;
  employee_id: string;
  work_date: string;
  minutes: number;
  type: 'normal' | 'locked' | 'absent' | 'holiday' | 'empty';
  is_locked: boolean;
  published: boolean;
};


interface EmployeeScheduleViewProps {
  currentEmployee: Employee;
  allEmployees: Employee[];
  timePeriod: TimePeriod;
  settings: AppSettings;
}


type EmployeeWithMappedShifts = Omit<Employee, "shifts"> & {
  shifts: Record<string, ShiftType>;
};

const EmployeeScheduleView: React.FC<EmployeeScheduleViewProps> = ({
  currentEmployee,
  allEmployees,
  timePeriod,
  settings
}) => {
  const [showAllEmployees, setShowAllEmployees] = useState(false);

  const [employeeShifts, setEmployeeShifts] = useState<Record<string, Record<string, ShiftType>>>({});

useEffect(() => {
  const fetchShifts = async () => {
    const employeeIds = showAllEmployees
      ? allEmployees.filter(e => e.isActive).map(e => e.id)
      : [currentEmployee.id];

const { data, error } = await supabase
  .from("shifts")
  .select("employee_id, work_date, minutes, type, is_locked, published") // julkaisu mukana
  .gte("work_date", dates[0].fullDate.toISOString().slice(0, 10))
  .lte("work_date", dates[timePeriod - 1].fullDate.toISOString().slice(0, 10))
  .eq("published", true);


      if (!error && data) {
        const grouped: Record<string, Record<string, ShiftType>> = {};
        data.forEach((shift) => {
const type: ShiftType["type"] =
  shift.type === "normal"
    ? "normal"
    : shift.type === "vacation"
    ? "holiday" // mappaa lomaan
    : shift.type === "sick"
    ? "absent"  // mappaa poissaoloon
    : "empty";


          if (!grouped[shift.employee_id]) grouped[shift.employee_id] = {};
          grouped[shift.employee_id][shift.work_date] = {
            type,
            minutes: shift.minutes,
          };
        });
        setEmployeeShifts(grouped);
      }
  };

  fetchShifts();
}, [showAllEmployees, currentEmployee.id, allEmployees]);


  // Generate dates based on time period and settings
  const generateDates = (period: TimePeriod): DateInfo[] => {
    const dates: DateInfo[] = [];
    const today = new Date();
    const startDate = new Date(today);
    
    // Adjust for week start day setting
    const dayOfWeek = startDate.getDay();
    let daysToStart: number;
    
    const startDaySetting = settings?.general?.weekStartDay ?? 'monday';
    if (startDaySetting === 'monday') {
      daysToStart = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    } else {
      daysToStart = dayOfWeek;
    }

    const dayNames = startDaySetting === 'monday'
      ? ['MA', 'TI', 'KE', 'TO', 'PE', 'LA', 'SU']
      : ['SU', 'MA', 'TI', 'KE', 'TO', 'PE', 'LA'];

    for (let i = 0; i < period; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const dayIndex = settings.general.weekStartDay === 'monday' 
        ? (date.getDay() + 6) % 7
        : date.getDay();
        
      const dayName = dayNames[dayIndex];
      
      let dateStr: string;
      const day = date.getDate();
      const month = date.getMonth() + 1;
      
      const formatSetting = settings?.general?.dateFormat ?? 'dd.mm.yyyy';
      switch (formatSetting) {
        case 'mm/dd/yyyy':
          dateStr = `${month}/${day}`;
          break;
        case 'yyyy-mm-dd':
          dateStr = `${month}-${day}`;
          break;
        case 'dd.mm.yyyy':
        default:
          dateStr = `${day}.${month}`;
          break;
      }
      
      dates.push({
        day: dayName,
        date: dateStr,
        fullDate: new Date(date)
      });
    }

    return dates;
  };

  const dates = generateDates(timePeriod);


  // Filter employees to show
  const displayEmployees = showAllEmployees ? allEmployees : [currentEmployee];
const employeesWithShifts: EmployeeWithMappedShifts[] = displayEmployees.map((emp) => ({
  ...emp,
  shifts: employeeShifts[emp.id] || {},
}));

  const getShiftDisplay = (shift: ShiftType, isCurrentEmployee: boolean = false) => {
    const baseStyle = '';

    
    switch (shift.type) {
      case 'normal':
        return { 
          content: shift.minutes ? formatMinutes(shift.minutes) : "", 
          color: `bg-primary text-primary-foreground ${baseStyle}`, 
          icon: <Clock className="w-3 h-3" /> 
        };
      case 'locked':
        return { 
          content: shift.minutes ? formatMinutes(shift.minutes) : "", 
          color: `bg-amber-500 text-white ${baseStyle}`, 
          icon: <Lock className="w-3 h-3" /> 
        };
      case 'absent':
        return { 
          content: 'P', 
          color: `bg-destructive text-destructive-foreground ${baseStyle}`, 
          icon: <AlertCircle className="w-3 h-3" /> 
        };
      case 'holiday':
        return { 
          content: 'L', 
          color: `bg-blue-500 text-white ${baseStyle}`, 
          icon: <Plane className="w-3 h-3" /> 
        };
      default:
        return { 
          content: '', 
          color: `bg-muted ${baseStyle}`, 
          icon: null 
        };
    }
  };

 const getTotalMinutes = (shifts: Record<string, ShiftType>) => {
   return Object.values(shifts).reduce((total, shift) => {
     return total + (shift.minutes || 0);
   }, 0);
 };

 const currentEmployeeTotalMinutes = getTotalMinutes(employeeShifts[currentEmployee.id] || {});
  const gridCols = `grid-cols-${Math.min(7 + 1, 12)}`;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Calendar className="w-6 h-6 text-primary" />
              <CardTitle className="text-xl text-primary">
                Työvuorot (7 päivää)
              </CardTitle>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="px-3 py-1">
                <Clock className="w-4 h-4 mr-2" />
                Omat tunnit: {formatMinutes(currentEmployeeTotalMinutes)}
              </Badge>
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-all"
                  checked={showAllEmployees}
                  onCheckedChange={setShowAllEmployees}
                />
                <Label htmlFor="show-all" className="text-sm flex items-center gap-2">
                  {showAllEmployees ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  {showAllEmployees ? 'Näytä vain omat' : 'Näytä kaikki'}
                </Label>
              </div>
            </div>
          </div>
          {showAllEmployees && (
            <div className="text-sm text-muted-foreground bg-blue-50 px-3 py-2 rounded-md mt-2">
              <Users className="w-4 h-4 inline mr-2" />
              Näytetään kaikkien työntekijöiden vuorot. Omat vuorosi on korostettu.
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-full">
              {/* Header */}
              <div className="bg-muted/50 border-b">
                <div className={`grid gap-px ${gridCols}`} style={{ gridTemplateColumns: `200px repeat(${timePeriod}, 1fr)` }}>
                  <div className="p-4 bg-background">
                    <span className="text-sm font-medium text-muted-foreground">Työntekijä</span>
                  </div>
                  {dates.map((date, index) => {
                    const isToday = date.fullDate.toDateString() === new Date().toDateString();
                    return (
                      <div key={index} className={`p-3 bg-background text-center min-w-[80px] ${isToday ? 'bg-primary/10' : ''}`}>
                        <div className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                          {date.day}
                        </div>
                        <div className={`text-sm font-semibold mt-1 ${isToday ? 'text-primary' : ''}`}>
                          {date.date}
                        </div>
                        {isToday && (
                          <div className="text-xs text-primary font-medium">Tänään</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Employee Rows */}
              <div className="divide-y divide-border">
                {employeesWithShifts.map((employee) => {
                  const isCurrentEmployee = employee.id === currentEmployee.id;
                  return (
                    <div 
                      key={employee.id} 
                      className={`grid gap-px ${gridCols} transition-colors ${
                      isCurrentEmployee ? 'bg-primary/5' : ''
                      } hover:bg-accent/30`} 
                      style={{ gridTemplateColumns: `200px repeat(${timePeriod}, 1fr)` }}
                    >
                      <div className="p-4 bg-background flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isCurrentEmployee ? 'text-primary' : ''}`}>
                              {employee.name}
                              {isCurrentEmployee && ' (Sinä)'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">{employee.department}</div>
                        </div>
<Badge variant="outline" className="text-xs">
  {formatMinutes(getTotalMinutes(employee.shifts))}
</Badge>

                      </div>
                      {dates.map((d, dayIndex) => {
                        const dateKey = d.fullDate.toISOString().slice(0, 10);
                        const shift = employee.shifts[dateKey] || { type: "empty", minutes: 0 };
                        const shiftDisplay = getShiftDisplay(shift, isCurrentEmployee);
                        const isToday = d.fullDate.toDateString() === new Date().toDateString();

                        return (
                          <div
                            key={dayIndex}
                            className={`
                              h-16 p-2 m-0 rounded-none border-0 
                              flex items-center justify-center min-w-[80px]
                              ${shiftDisplay.color}
                              transition-all duration-200
                            `}
                            title={`${employee.name} - ${d.day} ${d.date}${shift.type === 'normal' ? ` (${formatMinutes(shift.minutes ?? 0)})` : shift.type === 'empty' ? ' - Vapaa' : ''}`}

                          >
                            <div className="flex flex-col items-center space-y-1">
                              {shiftDisplay.icon}
                              {shiftDisplay.content && (
                                <span className="text-xs font-medium">{shiftDisplay.content}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Summary Row for all employees view */}
              {showAllEmployees && (
                <div className="bg-accent/50 border-t-2 border-primary/20">
                  <div className={`grid gap-px ${gridCols}`} style={{ gridTemplateColumns: `200px repeat(${timePeriod}, 1fr)` }}>
                    <div className="p-4 bg-background">
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Yhteensä ({employeesWithShifts.length} työntekijää)</span>
                      </div>
                    </div>
                    {dates.map((_, dayIndex) => {
                      const dateKey = dates[dayIndex].fullDate.toISOString().slice(0, 10);
                      const dayTotal = employeesWithShifts.reduce((total, employee) => {
                        const shift = employee.shifts[dateKey];
                        return total + (shift?.minutes || 0);
                      }, 0);

                      const countEmployees = employeesWithShifts.filter(emp => emp.shifts[dateKey]?.type !== 'empty').length;

                      return (
                        <div key={dayIndex} className="p-3 bg-background text-center min-w-[80px]">
                          <div className="text-sm font-semibold text-primary">{formatMinutes(dayTotal)}</div>
                          <div className="text-xs text-muted-foreground">
                            {countEmployees} henkilöä
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Week Summary */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Viikon yhteenveto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border border-border rounded-lg bg-primary/5">
              <div className="text-2xl font-bold text-primary">{formatMinutes(currentEmployeeTotalMinutes)}</div>
              <div className="text-sm text-muted-foreground">Omat tunnit yhteensä</div>
            </div>
            <div className="text-center p-4 border border-border rounded-lg">
              <div className="text-2xl font-bold">
                {(currentEmployee.shifts ?? []).filter(s => s.type !== 'empty').length}
              </div>
              <div className="text-sm text-muted-foreground">Työvuoroja</div>
            </div>
            <div className="text-center p-4 border border-border rounded-lg">
              <div className="text-2xl font-bold">
                {7 - ((currentEmployee.shifts ?? []).filter(s => s.type !== 'empty').length)}
              </div>
              <div className="text-sm text-muted-foreground">Vapaapäiviä</div>
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
            {!showAllEmployees && (
              <div className="flex items-center space-x-2 border-l border-border pl-4 ml-2">
                <div className="w-4 h-4 bg-primary rounded-sm ring-2 ring-primary ring-offset-2"></div>
                <span className="text-sm">Omat vuorosi korostettu</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Footer Note */}
      <div className="text-center text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
        {showAllEmployees 
          ? 'Omat vuorosi on korostettu. Voit piilottaa muiden työntekijöiden vuorot kytkimellä.'
          : 'Voit nähdä kaikkien työntekijöiden vuorot kytkemällä "Näytä kaikki" -vaihtoehdon päälle.'
        }
      </div>
    </div>
  );
};

export default EmployeeScheduleView;