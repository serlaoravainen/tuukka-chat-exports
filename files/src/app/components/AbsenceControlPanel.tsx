"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Calendar,
  MessageSquare,
  User,
  AlertTriangle
} from 'lucide-react';
import { AbsenceRequest } from '../types';
import { toast } from 'sonner';
import { supabase } from '@/lib/supaBaseClient';
import { notifyAbsenceDecision } from '@/features/absences/notify';
import { useSettingsStore } from "@/store/useSettingsStore";


const AbsenceControlPanel = () => {
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [adminResponse, setAdminResponse] = useState('');

  const emailEnabled =
  useSettingsStore((s) => s.settings?.notifications?.emailNotifications ?? true);

  // --- FETCH FROM SUPABASE ---
  useEffect(() => {
    const fetchAbsences = async () => {
const { data, error } = await supabase
  .from('time_off_requests')
  .select(`
    id,
    employee_id,
    start_date,
    end_date,
    reason,
    message,
    status,
    submitted_at,
    employees:employees!time_off_requests_employee_id_fkey ( name )
  `)
  .order('submitted_at', { ascending: false });

if (error) {
  console.error(error);
  toast.error('Poissaolojen haku epäonnistui');
  return;
}

type AbsenceRow = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'declined';
  submitted_at: string;
  employees?: { name: string }[] | { name: string } | null;
};

const mapped: AbsenceRequest[] = (data as AbsenceRow[]).map((r) => {
  const employeeName = Array.isArray(r.employees)
    ? r.employees[0]?.name
    : r.employees?.name;

  return {
    id: r.id,
    employeeId: r.employee_id,
    employeeName: employeeName ?? 'Tuntematon',
    startDate: r.start_date,
    endDate: r.end_date ?? '',
    reason: r.reason ?? '',
    status: r.status,
    submittedAt: r.submitted_at,
    message: r.message ?? '',
  };
});


      setRequests(mapped);
      
    };

    fetchAbsences();
  }, []);

  // --- STATUS HELPERS (UI) ---
  const getStatusBadge = (status: AbsenceRequest['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300"><Clock className="w-3 h-3 mr-1" />Odottaa</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300"><CheckCircle className="w-3 h-3 mr-1" />Hyväksytty</Badge>;
      case 'declined':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300"><XCircle className="w-3 h-3 mr-1" />Hylätty</Badge>;
    }
  };

  // --- SUPABASE UPDATES ---
const handleApprove = async (requestId: string) => {
  // Optimistinen päivitys
  setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved' } : r));

  const target = requests.find(r => r.id === requestId);
  const { error } = await supabase.from('time_off_requests').update({ status: 'approved' }).eq('id', requestId);
  if (error) {
    console.error('[ABSENCE APPROVE ERROR]', error.code, error.message, error.details);
    // revert
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'pending' } : r));
    toast.error('Hyväksyntä epäonnistui');
    return;
  }
  // Lähetä sähköposti + loki notify.ts:n kautta (ei kaadeta hyväksyntää, jos maili epäonnistuu)
  if (emailEnabled && target) {
    try {
      await notifyAbsenceDecision({
        employeeIds: [target.employeeId],
        status: "approved",
        startDate: target.startDate,
        endDate: target.endDate || null,
        adminMessage: adminResponse?.trim() || undefined,
      });
    } catch (e) {
      console.error("[EMAIL APPROVE ERROR]", e);
      toast.error("Sähköpostin lähetys epäonnistui (hyväksyntä tallessa).");
    }
  }
  toast.success('Poissaolopyyntö hyväksytty');
};


const handleDecline = async (requestId: string) => {
  setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'declined' } : r));

  const target = requests.find(r => r.id === requestId);
  const { error } = await supabase.from('time_off_requests').update({ status: 'declined' }).eq('id', requestId);
  if (error) {
    console.error('[ABSENCE DECLINE ERROR]', error.code, error.message, error.details);
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'pending' } : r));
    toast.error('Hylkäys epäonnistui');
    return;
  }

  if (emailEnabled && target) {
    try {
      await notifyAbsenceDecision({
        employeeIds: [target.employeeId],
        status: "declined",
        startDate: target.startDate,
        endDate: target.endDate || null,
        adminMessage: adminResponse?.trim() || undefined,
      });
    } catch (e) {
      console.error("[EMAIL DECLINE ERROR]", e);
      toast.error("Sähköpostin lähetys epäonnistui (hylkäys tallessa).");
    }
  }
  toast.success('Poissaolopyyntö hylätty');
};


  // --- DERIVED LISTS (UI pysyy samana) ---
  const pendingRequests = requests.filter(req => req.status === 'pending');
  const processedRequests = requests.filter(req => req.status !== 'pending');

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fi-FI', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fi-FI', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <CardTitle className="text-xl text-primary">Odottavat poissaolopyynnöt</CardTitle>
            </div>
            <Badge variant="secondary" className="px-3 py-1">
              {pendingRequests.length} pyyntöä
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Ei odottavia poissaolopyyntöjä</p>
            </div>
          ) : (
            pendingRequests.map((request) => (
              <div key={request.id} className="border border-border rounded-lg p-4 bg-background hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {request.employeeName?.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{request.employeeName}</h4>
                        {getStatusBadge(request.status)}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {formatDate(request.startDate)} 
                            {request.startDate !== request.endDate && ` - ${formatDate(request.endDate)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>Syy: {request.reason}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>Jätetty: {formatDateTime(request.submittedAt || '')}</span>
                        </div>
                      </div>
                      {request.message && (
                        <div className="mt-3 p-3 bg-muted/50 rounded-md">
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground" />
                            <p className="text-sm">{request.message}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <div
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Vastaa
                        </div>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Vastaa poissaolopyyntöön</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Viesti työntekijälle:</label>
                            <Textarea 
                              value={adminResponse}
                              onChange={(e) => setAdminResponse(e.target.value)}
                              placeholder="Kirjoita viesti..."
                              className="min-h-[100px]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => {
                                handleApprove(request.id);
                                setAdminResponse('');
                              }}
                              className="flex-1"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Hyväksy
                            </Button>
                            <Button 
                              variant="destructive"
                              onClick={() => {
                                handleDecline(request.id);
                                setAdminResponse('');
                              }}
                              className="flex-1"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Hylkää
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button 
                      size="sm"
                      onClick={() => handleApprove(request.id)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDecline(request.id)}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Processed Requests */}
      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Käsitellyt pyynnöt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {processedRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/30">
                <div className="flex items-center space-x-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs">
                      {request.employeeName?.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{request.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(request.startDate)} - {request.reason}
                    </p>
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AbsenceControlPanel;
