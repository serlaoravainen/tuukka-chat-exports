import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const schema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().min(1),
  message: z.string().optional(),
});

export async function POST(req: Request) {
  console.log("➡️ /api/timeoff hit");
  const body = await req.json();
  console.log("➡️ Request body:", body);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  // 🟢 Ota käyttäjän token headersista
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  console.log("➡️ Authorization header:", token);

  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  // 🟢 Luo uusi supabase-client tokenin kanssa
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { startDate, endDate, reason, message } = parsed.data;

// Hae työntekijän rivi auth.id:n perusteella
const { data: employee, error: empError } = await supabase
  .from("employees")
  .select("id")
  .eq("auth_user_id", user.id)
  .single();

if (empError || !employee) {
  return NextResponse.json({ error: "Employee not found for this user" }, { status: 404 });
}

// Käytä employees.id foreign keynä
const { data, error } = await supabase
  .from("time_off_requests")
  .insert({
    employee_id: employee.id,   // ✅ oikea id employees-taulusta
    start_date: startDate,
    end_date: endDate,
    reason,
    message,
    status: "pending",
  })
  .select()
  .single();

  if (error) {
    console.error("❌ Insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("✅ Inserted request:", data);
  return NextResponse.json({ ok: true, request: data });
}
