import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { name, email, department, isActive } = await req.json();
    if (!name?.trim() || !email?.trim() || !department?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Authorization header -pohjainen admin-check
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Tämä client käyttää kutsujan access tokenia
    const userSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: userRes, error: userErr } = await userSb.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: me, error: roleErr } = await userSb
      .from("employees")
      .select("role")
      .eq("auth_user_id", userRes.user.id)
      .maybeSingle();
    if (roleErr || !me || me.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Admin-operaatiot service roolella
    const adminSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: created, error: createErr } = await adminSb.auth.admin.createUser({
      email: email.trim(),
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return NextResponse.json({ error: createErr?.message ?? "createUser failed" }, { status: 400 });
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const { data: linkRes, error: linkErr } = await adminSb.auth.admin.generateLink({
      type: "recovery",
      email: email.trim(),
      options: { redirectTo: `${appUrl}/set-password` },
    });
    if (linkErr || !linkRes?.properties?.action_link) {
      return NextResponse.json({ error: linkErr?.message ?? "generateLink failed" }, { status: 400 });
    }

    const { data: employee, error: empErr } = await adminSb
      .from("employees")
      .insert([{
        name: name.trim(),
        email: email.trim(),
        department: department.trim(),
        is_active: !!isActive,
        auth_user_id: created.user.id,
        role: "employee",
      }])
      .select("id, name, email, department, is_active, created_at")
      .single();

    if (empErr) {
      return NextResponse.json({ error: empErr.message }, { status: 400 });
    }

    const link = linkRes.properties.action_link as string;
    await adminSb.from("email_queue").insert({
      recipient: email.trim(),
      subject: "Tervetuloa Soiliin – aseta salasanasi",
      body: `Hei ${name.trim()},\n\nTervetuloa Soiliin!\nAseta salasanasi tästä linkistä:\n${link}\n\nTerveisin,\nSoili`,
      status: "queued",
    });

    return NextResponse.json({ employee }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}