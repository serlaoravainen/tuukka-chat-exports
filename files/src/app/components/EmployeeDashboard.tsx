"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supaBaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { 
  Calendar, 
  Clock, 
  FileText, 
  Bell, 
  ArrowLeftRight,
  CheckCircle,
  AlertCircle,
  Home
} from 'lucide-react';
import { Employee, EmployeeTimeOffRequest, ShiftChangeRequest, EmployeeNotification, ShiftType } from '../types';
import EmployeeScheduleView from './EmployeeScheduleView';
import TimeOffRequestForm from './TimeOffRequestForm';
import ShiftChangeRequestForm from './ShiftChangeRequestForm';
import EmployeeNotificationCenter from './EmployeeNotificationCenter';
import EmployeeScheduleControls from './EmployeeScheduleControls';
import { formatMinutes } from "@/lib/timeUtils";


type TimeOffRow = {
  id: string;
  employee_id: string;
  employee?: { name: string }[];
  target?: { name: string }[];
  start_date: string;
  end_date: string;
  reason?: string | null;
  message?: string | null;
  status: "pending" | "approved" | "declined";
  submitted_at: string;
};

type ShiftChangeRow = {
  id: string;
  employee_id: string;
  employee?: { name: string }[];   // korjattu: array
  target_employee_id?: string;
  target?: { name: string }[];     // korjattu: array
  current_shift_date: string;
  requested_shift_date: string;
  reason?: string | null;
  message?: string | null;
  status: "pending" | "approved" | "declined";
  submitted_at: string;
};



interface EmployeeDashboardProps {
  currentEmployee: Employee;
  allEmployees: Employee[];
  onSwitchToAdmin: () => void;
}

const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  currentEmployee,
  allEmployees,
  onSwitchToAdmin
}) => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [days, setDays] = useState<7 | 14 | 30>(7);


  const [timeOffRequests, setTimeOffRequests] = useState<EmployeeTimeOffRequest[]>([]);
  useEffect(() => {
    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from("absences")
        .select(`
          id,
          employee_id,
          start_date,
          end_date,
          reason,
          message,
          status,
          submitted_at,
          employees!absences_employee_id_fkey ( name )
        `)
        .eq("employee_id", currentEmployee.id)
        .order("submitted_at", { ascending: false });

      if (!error && data) {
        setTimeOffRequests(
          data.map((r: TimeOffRow) => ({
            id: r.id,
            employeeId: r.employee_id,
            employeeName: r.employee?.[0]?.name ?? currentEmployee.name,
            targetEmployeeName: r.target?.[0]?.name ?? undefined,
            startDate: r.start_date,
            endDate: r.end_date,
            reason: r.reason ?? '',
            message: r.message ?? undefined,
            status: r.status,
            submittedAt: r.submitted_at,
          }))
        );
      }

    };
    fetchRequests();
  }, [currentEmployee.id, currentEmployee.name]);

  const [shiftChangeRequests, setShiftChangeRequests] = useState<ShiftChangeRequest[]>(() => []);

  useEffect(() => {
    const fetchShiftChanges = async () => {
      const { data, error } = await supabase
        .from("shift_change_requests")
        .select(`
          id,
          employee_id,
          target_employee_id,
          current_shift_date,
          requested_shift_date,
          reason,
          message,
          status,
          submitted_at,
          employee:employees!shift_change_requests_employee_id_fkey ( name ),
          target:employees!shift_change_requests_target_employee_id_fkey ( name )
        `)
        .eq("employee_id", currentEmployee.id)
        .order("submitted_at", { ascending: false });

      if (!error && data) {
setShiftChangeRequests(
  data.map((r: ShiftChangeRow) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employee?.[0]?.name ?? currentEmployee.name,
    targetEmployeeId: r.target_employee_id ?? undefined,
    targetEmployeeName: r.target?.[0]?.name ?? undefined,
    currentDate: r.current_shift_date,
    requestedDate: r.requested_shift_date,
    reason: r.reason ?? "",
    message: r.message ?? undefined,
    status: r.status,
    submittedAt: r.submitted_at,
    currentShift: { type: "normal", hours: 0 } as ShiftType,
    requestedShift: { type: "normal", hours: 0 } as ShiftType,
  }))
);

      }
    };
    fetchShiftChanges();
  }, [currentEmployee.id, currentEmployee.name]);

  const [notifications, setNotifications] = useState<EmployeeNotification[]>(() => []);

  useEffect(() => {
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from("employee_notifications")
        .select("*")
        .eq("employee_id", currentEmployee.id)
        .order("created_at", { ascending: false });
      if (!error && data) setNotifications(data);
    };
    fetchNotifications();
  }, [currentEmployee.id]);


  const unreadNotifications = notifications.filter(n => !n.isRead).length;


 const totalHoursThisWeek = (currentEmployee.shifts ?? [])
   .slice(0, 7)
   .reduce((total, shift) => total + (shift.minutes || 0), 0);


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fi-FI', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: 'pending' | 'approved' | 'declined') => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300"><Clock className="w-3 h-3 mr-1" />Odottaa</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300"><CheckCircle className="w-3 h-3 mr-1" />Hyväksytty</Badge>;
      case 'declined':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300"><AlertCircle className="w-3 h-3 mr-1" />Hylätty</Badge>;
    }
  };

  const addTimeOffRequest = async (
    request: Omit<EmployeeTimeOffRequest, "id" | "employeeId" | "submittedAt" | "status">
  ) => {
    const { data, error } = await supabase
      .from("absences")
      .insert([{
        employee_id: currentEmployee.id,
        start_date: request.startDate,
        end_date: request.endDate,
        reason: request.reason,
        message: request.message,
      }])
      .select()
      .single();

    if (!error && data) {
      setTimeOffRequests(prev => [
        {
          id: data.id,
          employeeId: data.employee_id,
          employeeName: currentEmployee.name,
          startDate: data.start_date,
          endDate: data.end_date,
          reason: data.reason,
          message: data.message,
          status: data.status,
          submittedAt: data.submitted_at,
        },
        ...prev,
      ]);
    }
  };

  const addShiftChangeRequest = async (
    request: Omit<ShiftChangeRequest, "id" | "employeeId" | "employeeName" | "submittedAt" | "status">
  ) => {
    const { data, error } = await supabase
      .from("shift_change_requests")
      .insert([{
        employee_id: currentEmployee.id,
        target_employee_id: request.targetEmployeeId,
        current_shift_date: request.currentDate,
        requested_shift_date: request.requestedDate,
        reason: request.reason,
        message: request.message
      }])
      .select(`
        id,
        employee_id,
        target_employee_id,
        current_shift_date,
        requested_shift_date,
        reason,
        message,
        status,
        submitted_at,
        employee:employees!shift_change_requests_employee_id_fkey ( name ),
        target:employees!shift_change_requests_target_employee_id_fkey ( name )
      `)
      .single();

    if (!error && data) {
      setShiftChangeRequests(prev => [
        {
          id: data.id,
          employeeId: data.employee_id,
          employeeName: data.employee?.[0]?.name ?? currentEmployee.name,
          targetEmployeeName: data.target?.[0]?.name ?? undefined,
          currentDate: data.current_shift_date,
          requestedDate: data.requested_shift_date,
          reason: data.reason ?? '',
          message: data.message ?? undefined,
          status: data.status,
          submittedAt: data.submitted_at,
          currentShift: { type: 'normal', hours: 0 },
          requestedShift: { type: 'normal', hours: 0 }
        },
        ...prev,
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {currentEmployee.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold">Tervetuloa, {currentEmployee.name.split(' ')[0]}!</h1>
              <p className="text-muted-foreground">{currentEmployee.department} • {currentEmployee.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {unreadNotifications > 0 && (
              <div className="relative">
                <Bell className="w-5 h-5 text-primary" />
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-5 w-5 text-xs flex items-center justify-center p-0 min-w-[20px]"
                >
                  {unreadNotifications}
                </Badge>
              </div>
            )}
            <Button
              variant="outline"
              onClick={onSwitchToAdmin}
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Admin-paneeli
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tämän viikon tunnit</p>
                  <p className="text-xl font-semibold">{totalHoursThisWeek}h</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Odottavat pyynnöt</p>
                  <p className="text-xl font-semibold">
                    {timeOffRequests.filter(r => r.status === 'pending').length + 
                     shiftChangeRequests.filter(r => r.status === 'pending').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hyväksytyt pyynnöt</p>
                  <p className="text-xl font-semibold">
                    {timeOffRequests.filter(r => r.status === 'approved').length + 
                     shiftChangeRequests.filter(r => r.status === 'approved').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Bell className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Lukemattomat ilmoitukset</p>
                  <p className="text-xl font-semibold">{unreadNotifications}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[500px] mx-auto">
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Työajat
            </TabsTrigger>
            <TabsTrigger value="time-off" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Poissaolot
            </TabsTrigger>
            <TabsTrigger value="shift-change" className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              Vuoronvaihdot
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Ilmoitukset
              {unreadNotifications > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 text-xs flex items-center justify-center p-0">
                  {unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Schedule View Tab */}
          <TabsContent value="schedule" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Työvuorot
                </CardTitle>
                <EmployeeScheduleControls days={days} setDays={setDays} />
              </CardHeader>
              <CardContent>
                <EmployeeScheduleView 
                  currentEmployee={currentEmployee}
                  allEmployees={allEmployees}
                  settings={{ general: { weekStartDay: "monday", dateFormat: "dd.mm.yyyy" } }}
                  timePeriod={days}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Time Off Requests Tab */}
          <TabsContent value="time-off" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TimeOffRequestForm onSubmit={addTimeOffRequest} />
              
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Omat poissaolopyynnöt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {timeOffRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Ei poissaolopyyntöjä</p>
                  ) : (
                    timeOffRequests.map((request) => (
                      <div key={request.id} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{request.reason}</h4>
                            {getStatusBadge(request.status)}
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p><Calendar className="w-4 h-4 inline mr-2" />
                            {formatDate(request.startDate)} - {formatDate(request.endDate)}
                          </p>
                          <p><Clock className="w-4 h-4 inline mr-2" />
                            Jätetty: {new Date(request.submittedAt).toLocaleDateString('fi-FI')}
                          </p>
                        </div>
                        {request.message && (
                          <div className="mt-3 p-2 bg-muted/50 rounded text-sm">
                            {request.message}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Shift Change Requests Tab */}
          <TabsContent value="shift-change" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ShiftChangeRequestForm 
                currentEmployee={currentEmployee}
                allEmployees={allEmployees}
                onSubmit={addShiftChangeRequest} 
              />
              
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowLeftRight className="w-5 h-5" />
                    Omat vuoronvaihtopyynnöt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {shiftChangeRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Ei vuoronvaihtopyyntöjä</p>
                  ) : (
                    shiftChangeRequests.map((request) => (
                      <div key={request.id} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{request.reason}</h4>
                            {getStatusBadge(request.status)}
                          </div>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p><Calendar className="w-4 h-4 inline mr-2" />
                            {formatDate(request.currentDate)} → {formatDate(request.requestedDate)}
                          </p>
                          <p><Clock className="w-4 h-4 inline mr-2" />
                            {request.requestedShift?.minutes ? formatMinutes(request.requestedShift.minutes) : 'Vapaa'}
                          </p>
                        </div>
                        {request.message && (
                          <div className="mt-3 p-2 bg-muted/50 rounded text-sm">
                            {request.message}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <EmployeeNotificationCenter
              notifications={notifications}
              onMarkAsRead={(id) => setNotifications(prev => 
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
              )}
              onMarkAllAsRead={() => setNotifications(prev => 
                prev.map(n => ({ ...n, isRead: true }))
              )}
              onDelete={(id) => setNotifications(prev => 
                prev.filter(n => n.id !== id)
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EmployeeDashboard;