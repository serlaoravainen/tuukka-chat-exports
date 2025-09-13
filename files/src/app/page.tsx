"use client";

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Toaster } from './components/ui/sonner';
import Toolbar from './components/Toolbar';
import ScheduleTable from './components/ScheduleTable';
import AbsenceControlPanel from './components/AbsenceControlPanel';
import EmployeeList from './components/EmployeeList';
import { Calendar, Users, Clock } from 'lucide-react';


export default function App() {
  const [activeTab, setActiveTab] = useState('schedule');

  return (
    <div className="min-h-screen bg-background">
      {/* Toast notifications */}
      <Toaster position="top-right" />
      
      <div className="container mx-auto p-6 space-y-6">
        {/* Toolbar - always visible */}
        <Toolbar />
        
        {/* Main Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px] mx-auto">
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Vuorotaulukko
            </TabsTrigger>
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Työntekijät
            </TabsTrigger>
            <TabsTrigger value="absences" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Poissaolot
            </TabsTrigger>
          </TabsList>

          {/* Schedule Table Tab */}
          <TabsContent value="schedule" className="space-y-6">
            <ScheduleTable />
          </TabsContent>

          {/* Employee Management Tab */}
          <TabsContent value="employees" className="space-y-6">
            <EmployeeList />
          </TabsContent>

          {/* Absence Control Panel Tab */}
          <TabsContent value="absences" className="space-y-6">
            <AbsenceControlPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}