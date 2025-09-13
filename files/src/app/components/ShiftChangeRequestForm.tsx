"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ArrowLeftRight, Clock, Send, AlertCircle, User } from 'lucide-react';
import { Employee, ShiftChangeRequest, ShiftType } from '../types';
import { toast } from 'sonner';

interface ShiftChangeRequestFormProps {
  currentEmployee: Employee;
  allEmployees: Employee[];
    onSubmit: (
    request: Omit<
      ShiftChangeRequest,
      "id" | "employeeId" | "submittedAt" | "status"
    >
  ) => void;
}

const ShiftChangeRequestForm: React.FC<ShiftChangeRequestFormProps> = ({ 
  currentEmployee, 
  allEmployees, 
  onSubmit 
}) => {
  const [formData, setFormData] = useState({
    currentDate: '',
    requestedDate: '',
    requestedHours: '',
    requestType: 'change', // 'change' or 'swap'
    targetEmployeeId: '',
    reason: '',
    message: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get current employee's shifts for the selected date
  const getCurrentShift = (date: string): ShiftType | null => {
    if (!date) return null;
    
    // This is a simplified calculation - in real app you'd properly calculate the shift for the date
    const today = new Date();
    const selectedDate = new Date(date);
    const dayDiff = Math.floor((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (dayDiff >= 0 && dayDiff < currentEmployee.shifts.length) {
      return currentEmployee.shifts[dayDiff];
    }
    
    return null;
  };

  const currentShift = getCurrentShift(formData.currentDate);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.currentDate) {
      newErrors.currentDate = 'Nykyinen päivämäärä on pakollinen';
    }

    if (!formData.requestedDate) {
      newErrors.requestedDate = 'Haluttu päivämäärä on pakollinen';
    }

    if (formData.currentDate && formData.requestedDate) {
      if (formData.currentDate === formData.requestedDate) {
        newErrors.requestedDate = 'Haluttu päivämäärä ei voi olla sama kuin nykyinen';
      }

      const current = new Date(formData.currentDate);
      if (current < new Date()) {
        newErrors.currentDate = 'Nykyinen päivämäärä ei voi olla menneisyydessä';
      }
    }

    if (!currentShift || currentShift.type === 'empty') {
      newErrors.currentDate = 'Valitulla päivämäärällä ei ole vuoroa vaihdettavaksi';
    }

    if (formData.requestType === 'change' && !formData.requestedHours) {
      newErrors.requestedHours = 'Anna haluttu tuntimäärä';
    }

    if (formData.requestType === 'swap' && !formData.targetEmployeeId) {
      newErrors.targetEmployeeId = 'Valitse työntekijä jonka kanssa vaihtaa';
    }

    if (!formData.reason) {
      newErrors.reason = 'Syy on pakollinen';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Tarkista lomakkeen tiedot');
      return;
    }

    if (!currentShift) {
      toast.error('Virhe vuoron hakemisessa');
      return;
    }

    let requestedShift: ShiftType | undefined = undefined;
    let targetEmployeeId: string | undefined = undefined;
    let targetEmployeeName: string | undefined = undefined;

    if (formData.requestType === 'change') {
      requestedShift = {
        type: 'normal',
        hours: parseFloat(formData.requestedHours)
      };
    } else if (formData.requestType === 'swap') {
      targetEmployeeId = formData.targetEmployeeId;
      const targetEmployee = allEmployees.find(emp => emp.id === formData.targetEmployeeId);
      targetEmployeeName = targetEmployee?.name;
      // In a swap, the requested shift would be what the target employee has on the requested date
      requestedShift = { type: 'normal', hours: currentShift.hours }; // Simplified
    }

    onSubmit({
      currentDate: formData.currentDate,
      requestedDate: formData.requestedDate,
      currentShift,
      requestedShift,
      reason: formData.reason,
      message: formData.message || undefined,
      targetEmployeeId,
      targetEmployeeName,
      employeeName: currentEmployee.name
    });

    // Reset form
    setFormData({
      currentDate: '',
      requestedDate: '',
      requestedHours: '',
      requestType: 'change',
      targetEmployeeId: '',
      reason: '',
      message: ''
    });

    setErrors({});
    toast.success('Vuoronvaihtopyyntö lähetetty onnistuneesti!');
  };

  const reasonOptions = [
    'Henkilökohtainen asia',
    'Lääkäriaika',
    'Perhesyy',
    'Opiskelut',
    'Toinen työsuhde',
    'Kuljetuksellinen syy',
    'Muu syy'
  ];

  const otherEmployees = allEmployees.filter(emp => emp.id !== currentEmployee.id && emp.isActive);

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center space-x-3">
          <ArrowLeftRight className="w-6 h-6 text-primary" />
          <CardTitle className="text-xl text-primary">Vuoronvaihtopyyntö</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Request Type Selection */}
          <div className="space-y-3">
            <Label>Pyynnön tyyppi</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                className={`
                  p-3 border-2 rounded-lg cursor-pointer transition-all
                  ${formData.requestType === 'change' ? 'border-primary bg-primary/5' : 'border-border hover:border-accent-foreground'}
                `}
                onClick={() => setFormData(prev => ({ ...prev, requestType: 'change', targetEmployeeId: '' }))}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="font-medium">Vuoron muutos</span>
                </div>
                <p className="text-sm text-muted-foreground">Muuta oman vuorosi tuntimäärää tai ajankohtaa</p>
              </div>
              
              <div
                className={`
                  p-3 border-2 rounded-lg cursor-pointer transition-all
                  ${formData.requestType === 'swap' ? 'border-primary bg-primary/5' : 'border-border hover:border-accent-foreground'}
                `}
                onClick={() => setFormData(prev => ({ ...prev, requestType: 'swap', requestedHours: '' }))}
              >
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="font-medium">Vuoron vaihto</span>
                </div>
                <p className="text-sm text-muted-foreground">Vaihda vuoro toisen työntekijän kanssa</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentDate">Nykyinen vuoro *</Label>
              <Input
                id="currentDate"
                type="date"
                value={formData.currentDate}
                onChange={(e) => setFormData(prev => ({ ...prev, currentDate: e.target.value }))}
                className={errors.currentDate ? 'border-destructive' : ''}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.currentDate && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {errors.currentDate}
                </div>
              )}
              {currentShift && currentShift.type !== 'empty' && (
                <div className="text-sm text-muted-foreground bg-accent/50 p-2 rounded">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Nykyinen vuoro: {currentShift.hours}h
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="requestedDate">Haluttu päivämäärä *</Label>
              <Input
                id="requestedDate"
                type="date"
                value={formData.requestedDate}
                onChange={(e) => setFormData(prev => ({ ...prev, requestedDate: e.target.value }))}
                className={errors.requestedDate ? 'border-destructive' : ''}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.requestedDate && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {errors.requestedDate}
                </div>
              )}
            </div>
          </div>

          {/* Change-specific fields */}
          {formData.requestType === 'change' && (
            <div className="space-y-2">
              <Label htmlFor="requestedHours">Haluttu tuntimäärä *</Label>
              <Select 
                value={formData.requestedHours} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, requestedHours: value }))}
              >
                <SelectTrigger className={errors.requestedHours ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Valitse tuntimäärä" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0h (Vapaapäivä)</SelectItem>
                  <SelectItem value="4">4h</SelectItem>
                  <SelectItem value="6">6h</SelectItem>
                  <SelectItem value="7.5">7.5h</SelectItem>
                  <SelectItem value="8">8h</SelectItem>
                  <SelectItem value="10">10h</SelectItem>
                  <SelectItem value="12">12h</SelectItem>
                </SelectContent>
              </Select>
              {errors.requestedHours && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {errors.requestedHours}
                </div>
              )}
            </div>
          )}

          {/* Swap-specific fields */}
          {formData.requestType === 'swap' && (
            <div className="space-y-2">
              <Label htmlFor="targetEmployee">Vaihda työntekijän kanssa *</Label>
              <Select 
                value={formData.targetEmployeeId} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, targetEmployeeId: value }))}
              >
                <SelectTrigger className={errors.targetEmployeeId ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Valitse työntekijä" />
                </SelectTrigger>
                <SelectContent>
                  {otherEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      <div className="flex items-center gap-2">
                        <span>{employee.name}</span>
                        <Badge variant="outline" className="text-xs">{employee.department}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.targetEmployeeId && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {errors.targetEmployeeId}
                </div>
              )}
              {formData.targetEmployeeId && (
                <div className="text-sm text-muted-foreground bg-blue-50 p-2 rounded border border-blue-200">
                  <ArrowLeftRight className="w-4 h-4 inline mr-2 text-blue-600" />
                  Pyydät vaihtamaan vuoroasi {allEmployees.find(emp => emp.id === formData.targetEmployeeId)?.name} kanssa
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Syy *</Label>
            <Select value={formData.reason} onValueChange={(value) => setFormData(prev => ({ ...prev, reason: value }))}>
              <SelectTrigger className={errors.reason ? 'border-destructive' : ''}>
                <SelectValue placeholder="Valitse syy vuoronvaihdolle" />
              </SelectTrigger>
              <SelectContent>
                {reasonOptions.map((reason) => (
                  <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {errors.reason}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Lisätiedot (valinnainen)</Label>
            <Textarea
              id="message"
              placeholder="Kerro tarkemmat tiedot vuoronvaihdosta..."
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              className="min-h-[100px]"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium mb-1">Huomioitavaa:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Vuoronvaihtopyynnöt tulee jättää hyvissä ajoin</li>
                  <li>Esimies hyväksyy tai hylkää pyynnön</li>
                  {formData.requestType === 'swap' && (
                    <li>Toisen työntekijän tulee myös hyväksyä vaihto</li>
                  )}
                  <li>Muista tarkistaa ettei vuoronvaihto aiheuta ylitöitä</li>
                </ul>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!formData.currentDate || !formData.requestedDate || !formData.reason || (!currentShift || currentShift.type === 'empty')}
          >
            <Send className="w-4 h-4 mr-2" />
            Lähetä vuoronvaihtopyyntö
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ShiftChangeRequestForm;