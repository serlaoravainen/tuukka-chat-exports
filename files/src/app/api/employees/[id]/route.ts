import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Next 15: await params
    const { name, email, department, isActive } = await req.json();

    // Authorization header -pohjainen admin-check
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authHeader } },
      }
    );

    const { data: userRes } = await userSb.auth.getUser();
    if (!userRes?.user) {
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

    const adminSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: current, error: curErr } = await adminSb
      .from("employees")
      .select("id, name, email, department, is_active, auth_user_id")
      .eq("id", id)
      .maybeSingle();
    if (curErr || !current) {
      return NextResponse.json({ error: curErr?.message ?? "Employee not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (department !== undefined) updates.department = String(department).trim();
    if (isActive !== undefined) updates.is_active = !!isActive;

    const newEmail = email !== undefined ? String(email).trim() : undefined;
    const emailChanged = newEmail && newEmail !== current.email;

    let recoveryLink: string | null = null;
    if (emailChanged) {
      const { error: updAuthErr } = await adminSb.auth.admin.updateUserById(current.auth_user_id, {
        email: newEmail!,
      });
      if (updAuthErr) {
        return NextResponse.json({ error: updAuthErr.message }, { status: 400 });
      }

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const { data: linkRes, error: linkErr } = await adminSb.auth.admin.generateLink({
        type: "recovery",
        email: newEmail!,
        options: { redirectTo: `${appUrl}/set-password` },
      });
      if (linkErr || !linkRes?.properties?.action_link) {
        return NextResponse.json({ error: linkErr?.message ?? "generateLink failed" }, { status: 400 });
      }
      recoveryLink = linkRes.properties.action_link as string;
      updates.email = newEmail;
    }

    let updated = current;
    if (Object.keys(updates).length > 0) {
      const { data: updRow, error: updErr } = await adminSb
        .from("employees")
        .update(updates)
        .eq("id", id)
        .select("id, name, email, department, is_active, auth_user_id")
        .single();
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }
      updated = updRow!;
    }

    if (emailChanged && recoveryLink) {
      await adminSb.from("email_queue").insert({
        recipient: newEmail!,
        subject: "Soili – päivitä salasanasi",
        body: `Hei ${updated.name},\n\nSähköpostisi on päivitetty. Aseta (tai päivitä) salasanasi tästä linkistä:\n${recoveryLink}\n\nTerveisin,\nSoili`,
        status: "queued",
      });
    }

    return NextResponse.json({ employee: updated, emailChanged: !!emailChanged }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Internal error" }, { status: 500 });
  }
}