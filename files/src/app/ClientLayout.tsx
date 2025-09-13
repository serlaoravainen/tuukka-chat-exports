"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supaBaseClient";
import EmployeeDashboard from "@/app/components/EmployeeDashboard";
import AdminView from "@/app/components/AdminView";
import Login from "@/app/components/Login";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { Loader } from "lucide-react";
import { Employee } from "@/app/types";

function EmployeeDashboardWrapper() {
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // 1. Kokeile hakea auth_user_id:llä
      let { data: employee } = await supabase
        .from("employees")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      // 2. Jos ei löydy → fallback emaililla
      if (!employee) {
        const { data: employeeByEmail } = await supabase
          .from("employees")
          .select("*")
          .eq("email", user.email)
          .maybeSingle();
        employee = employeeByEmail;
      }

      setCurrentEmployee(employee as Employee);

      const { data: all } = await supabase.from("employees").select("*");
      setAllEmployees(all as Employee[]);

      setLoading(false);

      // Poista Magic Link -hash URL:ista
      if (
        typeof window !== "undefined" &&
        window.location.hash.includes("access_token")
      ) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    };
    loadData();
  }, []);

  const handleSwitchToAdmin = useCallback(() => {
    window.location.href = "/admin";
  }, []);

  if (loading || !currentEmployee) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <EmployeeDashboard
      currentEmployee={currentEmployee}
      allEmployees={allEmployees}
      onSwitchToAdmin={handleSwitchToAdmin}
    />
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<"admin" | "employee" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      // 1. Hae auth_user_id:llä
      let { data: profile } = await supabase
        .from("employees")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      // 2. Jos ei löydy → fallback emaililla
      if (!profile) {
        const { data: profileByEmail } = await supabase
          .from("employees")
          .select("role")
          .eq("email", user.email)
          .maybeSingle();
        profile = profileByEmail;
      }

      setRole(profile?.role ?? null);
      setLoading(false);
    };
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <>
      {role === "admin" ? (
        <AdminView />
      ) : role === "employee" ? (
        <EmployeeDashboardWrapper />
      ) : (
        <Login />
      )}
      <ServiceWorkerRegister />
    </>
  );
}
