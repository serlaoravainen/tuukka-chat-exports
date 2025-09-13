"use client";

import Toolbar from "@/app/components/Toolbar";
import AbsenceControlPanel from "@/app/components/AbsenceControlPanel";
import ScheduleTable from "@/app/components/ScheduleTable";
import EmployeeList from "@/app/components/EmployeeList";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/ui/tabs";

export default function AdminView() {
  return (
    <div className="max-w-7xl mx-auto py-10">
      {/* Toolbar */}
      <div className="mb-6">
        <Toolbar />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto mb-6">
          <TabsTrigger value="schedule">Vuorot</TabsTrigger>
          <TabsTrigger value="employees">Työntekijät</TabsTrigger>
          <TabsTrigger value="absences">Poissaolot</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          <ScheduleTable />
        </TabsContent>

        <TabsContent value="employees">
         <EmployeeList />
        </TabsContent>

        <TabsContent value="absences">
          <AbsenceControlPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
