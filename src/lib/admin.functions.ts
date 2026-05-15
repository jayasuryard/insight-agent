import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const [{ data: profiles }, { data: roles }, { data: classes }, { data: assignments }, { count: submissionCount }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("classes").select("id, name, code, teacher_id, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("assignments").select("id, title, class_id, teacher_id, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("submissions").select("*", { count: "exact", head: true }),
    ]);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    const users = (profiles ?? []).map((p) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] }));
    return {
      users,
      classes: classes ?? [],
      assignments: assignments ?? [],
      stats: {
        userCount: users.length,
        classCount: classes?.length ?? 0,
        assignmentCount: assignments?.length ?? 0,
        submissionCount: submissionCount ?? 0,
      },
    };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "teacher", "student"]),
      grant: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Admin creates a class on behalf of a teacher. */
export const adminCreateClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().min(1).max(200),
      teacherId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { error } = await supabaseAdmin.from("classes").insert({
      name: data.name,
      code,
      teacher_id: data.teacherId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, code };
  });

/** Admin deletes a class and all its data. */
export const adminDeleteClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ classId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { data: assignments } = await supabaseAdmin
      .from("assignments").select("id").eq("class_id", data.classId);
    const assignmentIds = (assignments ?? []).map((a) => a.id);
    if (assignmentIds.length) {
      const { data: subs } = await supabaseAdmin
        .from("submissions").select("id").in("assignment_id", assignmentIds);
      const subIds = (subs ?? []).map((s) => s.id);
      if (subIds.length) {
        await supabaseAdmin.from("answers").delete().in("submission_id", subIds);
        await supabaseAdmin.from("submissions").delete().in("assignment_id", assignmentIds);
      }
      await supabaseAdmin.from("questions").delete().in("assignment_id", assignmentIds);
      await supabaseAdmin.from("assignments").delete().eq("class_id", data.classId);
    }
    await supabaseAdmin.from("class_members").delete().eq("class_id", data.classId);
    const { error } = await supabaseAdmin.from("classes").delete().eq("id", data.classId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin deletes an assignment and all related submissions/answers. */
export const adminDeleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const { data: subs } = await supabaseAdmin
      .from("submissions").select("id").eq("assignment_id", data.assignmentId);
    const subIds = (subs ?? []).map((s) => s.id);
    if (subIds.length) {
      await supabaseAdmin.from("answers").delete().in("submission_id", subIds);
      await supabaseAdmin.from("submissions").delete().eq("assignment_id", data.assignmentId);
    }
    await supabaseAdmin.from("questions").delete().eq("assignment_id", data.assignmentId);
    const { error } = await supabaseAdmin.from("assignments").delete().eq("id", data.assignmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin deletes a user and all their data. */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("Cannot delete yourself");
    await supabaseAdmin.from("class_members").delete().eq("student_id", data.userId);
    const { data: subs } = await supabaseAdmin
      .from("submissions").select("id").eq("student_id", data.userId);
    const subIds = (subs ?? []).map((s) => s.id);
    if (subIds.length) {
      await supabaseAdmin.from("answers").delete().in("submission_id", subIds);
      await supabaseAdmin.from("submissions").delete().eq("student_id", data.userId);
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin gets all submissions with details. */
export const adminGetSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("id, total_score, max_score, status, submitted_at, overall_feedback, assignments:assignment_id(id, title), profiles:student_id(full_name, email)")
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { submissions: data ?? [] };
  });
