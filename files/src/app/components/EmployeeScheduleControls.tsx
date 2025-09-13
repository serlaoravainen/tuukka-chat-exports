"use client";

import { Button } from "./ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Calendar as CalIcon } from "lucide-react";

interface EmployeeScheduleControlsProps {
  days: 7 | 14 | 30;
  setDays: React.Dispatch<React.SetStateAction<7 | 14 | 30>>;
}

export default function EmployeeScheduleControls({ days, setDays }: EmployeeScheduleControlsProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <CalIcon className="w-4 h-4" />
          {days} päivää
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 space-y-2">
        {[7, 14, 30].map((option) => (
          <Button
            key={option}
            variant={days === option ? "default" : "outline"}
            className="w-full justify-start"
            onClick={() => setDays(option as 7 | 14 | 30)}
          >
            {option} päivää
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
