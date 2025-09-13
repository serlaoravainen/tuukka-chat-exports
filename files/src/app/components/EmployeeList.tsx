"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Switch } from "./ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "./ui/dialog";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  Search,
  UserCheck,
  UserX,
  Mail,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supaBaseClient";

// Sama tyyppi kuin sulla (shifts jätetään tyhjäksi tässä vaiheessa)
type Employee = {
  id: string;
  name: string;
  email: string;
  department: string;
  isActive: boolean;
  shifts: Array<unknown>;
};

const EmployeeList = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Hakusuodatus
  const [searchTerm, setSearchTerm] = useState("");

  const [customDepartment, setCustomDepartment] = useState("");
  const [editCustomDepartment, setEditCustomDepartment] = useState("");

  const [creatingNewDept, setCreatingNewDept] = useState(false);
  const [editCreatingNewDept, setEditCreatingNewDept] = useState(false);

  // Edit/Add dialogit
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    department: "",
    isActive: true,
  });

  // 1) HAKU DB:stä
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, department, is_active, created_at")
        .order("created_at", { ascending: true });

      if (error) {
        console.error(error);
        toast.error("Työntekijöiden haku epäonnistui");
      } else {
        // Mapataan snake_case -> camelCase

          type EmployeeRow = {
          id: string;
          name: string;
          email: string;
          department: string;
          is_active: boolean;
          created_at: string; // tai Date, jos haluat käsitellä sitä
          };

          const mapped: Employee[] = (data ?? []).map((row: EmployeeRow) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          department: row.department,
          isActive: !!row.is_active,
          shifts: [], // ei vielä käytössä
        }));
        setEmployees(mapped);
      }
      setLoading(false);
    })();
  }, []);



// 2) LISÄYS
async function handleAddEmployee() {
  const name = newEmployee.name.trim();
  const email = newEmployee.email.trim();
  const dep = (newEmployee.department ?? "").trim();

  if (!name || !email || !dep) {
    toast.error("Täytä kaikki pakolliset kentät");
    return;
  }
  if (dep.toLowerCase() === "uusi osasto") {
    toast.error("Kirjoita osaston nimi.");
    return;
  }

  try {
    setAdding(true);

    // HAE TOKEN
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;

    const res = await fetch("/api/employees", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ name, email, department: dep, isActive: newEmployee.isActive }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Virhe työntekijän lisäämisessä");

    const added: Employee = {
      id: json.employee.id,
      name: json.employee.name,
      email: json.employee.email,
      department: json.employee.department,
      isActive: !!json.employee.is_active,
      shifts: [],
    };

    setEmployees(prev => [...prev, added]);
    setNewEmployee({ name: "", email: "", department: "", isActive: true });
    setIsAddDialogOpen(false);
    toast.success(`${added.name} lisätty ja salasanan asettamislinkki lähetetty osoitteeseen ${added.email}`);
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message ?? "Työntekijän lisääminen epäonnistui");
  } finally {
    setAdding(false);
  }
}

  // 3) POISTO
  async function handleDeleteEmployee(employeeId: string) {
    const target = employees.find((e) => e.id === employeeId);
    const { error } = await supabase.from("employees").delete().eq("id", employeeId);
    if (error) {
      console.error(error);
      toast.error("Poisto epäonnistui");
      return;
    }
    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    toast.success(`${target?.name ?? "Työntekijä"} poistettu`);
  }

  // 4) AKTIIVINEN/EPÄAKTIIVINEN toggle
  async function handleToggleActive(employeeId: string) {
    const current = employees.find((e) => e.id === employeeId);
    if (!current) return;

    const nextActive = !current.isActive;
    // Optimistic update
    setEmployees((prev) =>
      prev.map((e) => (e.id === employeeId ? { ...e, isActive: nextActive } : e))
    );

    const { error } = await supabase
      .from("employees")
      .update({ is_active: nextActive })
      .eq("id", employeeId);

    if (error) {
      console.error(error);
      // Revertoi jos meni pieleen
      setEmployees((prev) =>
        prev.map((e) => (e.id === employeeId ? { ...e, isActive: !nextActive } : e))
      );
      toast.error("Tilan muutos epäonnistui");
      return;
    }

    toast.success(`${current.name} ${nextActive ? "aktivoitu" : "deaktivoitu"}`);
  }

  // 5) EDIT / UPDATE
  function handleEditEmployee(employee: Employee) {
    setSelectedEmployee(employee);
  }


// ... existing code ...

async function handleUpdateEmployee() {
  if (!selectedEmployee) return;

  try {
    // HAE TOKEN
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;

    const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        name: selectedEmployee.name,
        email: selectedEmployee.email,
        department: selectedEmployee.department,
        isActive: selectedEmployee.isActive,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Päivitys epäonnistui");

    setEmployees(prev => prev.map(e =>
      e.id === selectedEmployee.id
        ? {
            ...e,
            name: json.employee.name,
            email: json.employee.email,
            department: json.employee.department,
            isActive: !!json.employee.is_active,
          }
        : e
    ));
    setSelectedEmployee(null);

    if (json.emailChanged) {
      toast.success("Tiedot päivitetty. Uusi salasana-linkki lähetetty uuteen sähköpostiin.");
    } else {
      toast.success("Työntekijätiedot päivitetty");
    }
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message ?? "Päivitys epäonnistui");
  }
}

  // Johdetut arvot (kuten ennen)
  const filteredEmployees = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
    );
  }, [employees, searchTerm]);

  const activeEmployees = employees.filter((e) => e.isActive).length;
const departments = useMemo(
  () =>
    [...new Set(
      employees
        .map(e => (e.department ?? "").trim())
        .filter(v => v && v.toLowerCase() !== "uusi osasto")
    )].sort((a, b) => a.localeCompare(b, "fi")),
  [employees]
);


  // —— UI alla: pidetään sun alkuperäinen rakenne ——
  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0 bg-gradient-to-r from-background to-secondary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="w-6 h-6 text-primary" />
              <CardTitle className="text-xl text-primary">Työntekijähallinta</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="px-3 py-1">
                <UserCheck className="w-4 h-4 mr-2" />
                {activeEmployees} aktiivista
              </Badge>

              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <div
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer"
                    onClick={() => setIsAddDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Lisää työntekijä
                  </div>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Lisää uusi työntekijä</DialogTitle>
                    <DialogDescription>Syötä työntekijän perustiedot ja lähetä salasana-linkki.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nimi *</Label>
                      <Input
                        id="name"
                        value={newEmployee.name}
                        onChange={(e) =>
                          setNewEmployee((p) => ({ ...p, name: e.target.value }))
                        }
                        placeholder="Etunimi Sukunimi"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Sähköposti *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newEmployee.email}
                        onChange={(e) =>
                          setNewEmployee((p) => ({ ...p, email: e.target.value }))
                        }
                        placeholder="etunimi.sukunimi@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Osasto *</Label>
                      <Select
  value={
    creatingNewDept
      ? "NEW_DEPT"
      : (newEmployee.department || "")
  }
  onValueChange={(value) => {
    if (value === "NEW_DEPT") {
      setCreatingNewDept(true);
      setCustomDepartment("");
      setNewEmployee(p => ({ ...p, department: "" })); // puhdas aloitus
    } else {
      setCreatingNewDept(false);
      setCustomDepartment("");
      setNewEmployee(p => ({ ...p, department: value }));
    }
  }}
>
  <SelectTrigger>
    <SelectValue placeholder="Valitse osasto" />
  </SelectTrigger>
  <SelectContent>
    {departments.map((dept) => (
      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
    ))}
    <SelectItem value="NEW_DEPT">+ Uusi osasto…</SelectItem>
  </SelectContent>
</Select>

{creatingNewDept && (
  <Input
    placeholder="Kirjoita uusi osasto…"
    className="mt-2"
    value={customDepartment}
    onChange={(e) => {
      const v = e.target.value;
      setCustomDepartment(v);
      setNewEmployee(p => ({ ...p, department: v })); // päivitetään arvo, mutta ei piiloteta inputtia
    }}
  />
)}



                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="active"
                        checked={newEmployee.isActive}
                        onCheckedChange={(checked) =>
                          setNewEmployee((p) => ({ ...p, isActive: checked }))
                        }
                      />
                      <Label htmlFor="active">Aktiivinen työntekijä</Label>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button onClick={handleAddEmployee} className="flex-1" disabled={adding}>
                        {adding ? "Lisätään…" : "Lisää työntekijä"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                        className="flex-1"
                      >
                        Peruuta
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Hae työntekijöitä nimellä, sähköpostilla tai osastolla..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Employee List */}
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Ladataan…</div>
            ) : (
              filteredEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="border border-border rounded-lg p-4 bg-background hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-12 h-12">
                        <AvatarFallback
                          className={`${
                            employee.isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {employee.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{employee.name}</h4>
                          {employee.isActive ? (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-300"
                            >
                              <UserCheck className="w-3 h-3 mr-1" />
                              Aktiivinen
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-gray-50 text-gray-700 border-gray-300"
                            >
                              <UserX className="w-3 h-3 mr-1" />
                              Ei-aktiivinen
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            <span>{employee.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4" />
                            <span>{employee.department}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`toggle-${employee.id}`} className="text-sm text-muted-foreground">
                          Aktiivinen
                        </Label>
                        <Switch
                          id={`toggle-${employee.id}`}
                          checked={employee.isActive}
                          onCheckedChange={() => handleToggleActive(employee.id)}
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleEditEmployee(employee)}>
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteEmployee(employee.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {!loading && filteredEmployees.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Ei työntekijöitä hakukriteereillä</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Employee Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Muokkaa työntekijää</DialogTitle>
            <DialogDescription>Päivitä työntekijän tiedot ja tallenna.</DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nimi</Label>
                <Input
                  id="edit-name"
                  value={selectedEmployee.name}
                  onChange={(e) =>
                    setSelectedEmployee((p) => (p ? { ...p, name: e.target.value } : p))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Sähköposti</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={selectedEmployee.email}
                  onChange={(e) =>
                    setSelectedEmployee((p) => (p ? { ...p, email: e.target.value } : p))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-department">Osasto</Label>

<Select
  value={
    editCreatingNewDept
      ? "NEW_DEPT"
      : (selectedEmployee?.department || "")
  }
  onValueChange={(value) => {
    if (!selectedEmployee) return;
    if (value === "NEW_DEPT") {
      setEditCreatingNewDept(true);
      setEditCustomDepartment("");
      setSelectedEmployee(p => p ? { ...p, department: "" } : p);
    } else {
      setEditCreatingNewDept(false);
      setEditCustomDepartment("");
      setSelectedEmployee(p => p ? { ...p, department: value } : p);
    }
  }}
>
  <SelectTrigger>
    <SelectValue placeholder="Valitse osasto" />
  </SelectTrigger>
  <SelectContent>
    {departments.map((dept) => (
      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
    ))}
    <SelectItem value="NEW_DEPT">+ Uusi osasto…</SelectItem>
  </SelectContent>
</Select>

{editCreatingNewDept && (
  <Input
    placeholder="Kirjoita uusi osasto…"
    className="mt-2"
    value={editCustomDepartment}
    onChange={(e) => {
      const v = e.target.value;
      setEditCustomDepartment(v);
      setSelectedEmployee(p => p ? { ...p, department: v } : p);
    }}
  />
)}


              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-active"
                  checked={selectedEmployee.isActive}
                  onCheckedChange={(checked) =>
                    setSelectedEmployee((p) => (p ? { ...p, isActive: checked } : p))
                  }
                />
                <Label htmlFor="edit-active">Aktiivinen työntekijä</Label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleUpdateEmployee} className="flex-1">
                  Tallenna muutokset
                </Button>
                <Button variant="outline" onClick={() => setSelectedEmployee(null)} className="flex-1">
                  Peruuta
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Department Statistics */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Osastotilastot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {useMemo(() => {
              const depts = [...new Set(employees.map((e) => e.department))];
              return depts.map((department) => {
                const deptEmployees = employees.filter((e) => e.department === department);
                const activeDeptEmployees = deptEmployees.filter((e) => e.isActive);
                return (
                  <div key={department} className="text-center p-3 border border-border rounded-lg">
                    <h4 className="font-medium mb-2">{department}</h4>
                    <div className="text-2xl font-bold text-primary">{activeDeptEmployees.length}</div>
                    <div className="text-xs text-muted-foreground">{deptEmployees.length} yhteensä</div>
                  </div>
                );
              });
            }, [employees])}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeList;
