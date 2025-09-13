"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar, Clock, Send, AlertCircle } from 'lucide-react';
import { EmployeeTimeOffRequest } from '../types';
import { toast } from 'sonner';
import { supabase } from "@/lib/supaBaseClient";


const TimeOffRequestForm: React.FC = () => {
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    message: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const reasonOptions = [
    'Henkilökohtainen asia',
    'Sairausloma',
    'Lääkäriaika',
    'Vuosiloma',
    'Vanhempainvapaa',
    'Perhevapaa',
    'Opintovapaa',
    'Muu syy'
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.startDate) {
      newErrors.startDate = 'Alkupäivämäärä on pakollinen';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'Loppupäivämäärä on pakollinen';
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      
      if (start > end) {
        newErrors.endDate = 'Loppupäivämäärä ei voi olla ennen alkupäivämäärää';
      }

      if (start < new Date()) {
        newErrors.startDate = 'Alkupäivämäärä ei voi olla menneisyydessä';
      }
    }

    if (!formData.reason) {
      newErrors.reason = 'Syy on pakollinen';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Tarkista lomakkeen tiedot');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Et ole kirjautunut sisään");
        return;
      }

      const res = await fetch("/api/timeoff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          startDate: formData.startDate,
          endDate: formData.endDate,
          reason: formData.reason,
          message: formData.message || undefined,
        }),
      });

     const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Virhe tallennuksessa");

      toast.success("Poissaolopyyntö lähetetty onnistuneesti!");
      setFormData({ startDate: "", endDate: "", reason: "", message: "" });
      setErrors({});
    } catch (err: any) {
      toast.error(err.message || "Virhe poissaolopyynnön lähetyksessä");
    }
  };

  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    
    if (start > end) return 0;
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    return diffDays;
  };

  const dayCount = calculateDays();

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center space-x-3">
          <Calendar className="w-6 h-6 text-primary" />
          <CardTitle className="text-xl text-primary">Uusi poissaolopyyntö</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Alkupäivämäärä *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                className={errors.startDate ? 'border-destructive' : ''}
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.startDate && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {errors.startDate}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">Loppupäivämäärä *</Label>
              <Input
                id="endDate"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                className={errors.endDate ? 'border-destructive' : ''}
                min={formData.startDate || new Date().toISOString().split('T')[0]}
              />
              {errors.endDate && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {errors.endDate}
                </div>
              )}
            </div>
          </div>

          {dayCount > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-700">
                <Clock className="w-4 h-4" />
                <span className="font-medium">
                  Poissaolon kesto: {dayCount} {dayCount === 1 ? 'päivä' : 'päivää'}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Syy *</Label>
            <Select value={formData.reason} onValueChange={(value) => setFormData(prev => ({ ...prev, reason: value }))}>
              <SelectTrigger className={errors.reason ? 'border-destructive' : ''}>
                <SelectValue placeholder="Valitse poissaolon syy" />
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
              placeholder="Kerro tarkemmat tiedot poissaolosta..."
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              className="min-h-[100px]"
            />
            <div className="text-xs text-muted-foreground">
              Voit antaa lisätietoja poissaolosta, esimerkiksi lääkärintodistuksesta tai kiireellisyydestä.
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium mb-1">Muista:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Pyyntö tulee jättää mahdollisimman aikaisin</li>
                  <li>Sairauspoissaoloista tarvitaan lääkärintodistus yli 3 päivän poissaoloissa</li>
                  <li>Esimies hyväksyy tai hylkää pyynnön</li>
                </ul>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!formData.startDate || !formData.endDate || !formData.reason}
          >
            <Send className="w-4 h-4 mr-2" />
            Lähetä poissaolopyyntö
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default TimeOffRequestForm;