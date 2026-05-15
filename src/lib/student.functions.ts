import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getMyResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("id, total_score, max_score, status, submitted_at, overall_feedback, assignments:assignment_id(id, title, classes:class_id(name))")
      .eq("student_id", context.userId)
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { submissions: data ?? [] };
  });

/** Join a class by code — uses admin client to bypass RLS for the code lookup. */
export const joinClassByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Look up class by code (bypasses RLS — code itself is the secret)
    const { data: cls, error: ce } = await supabaseAdmin
      .from("classes")
      .select("id, name")
      .eq("code", data.code.trim().toUpperCase())
      .maybeSingle();
    if (ce || !cls) throw new Error("Class code not found");

    // Check not already enrolled
    const { data: existing } = await supabaseAdmin
      .from("class_members")
      .select("id")
      .eq("class_id", cls.id)
      .eq("student_id", userId)
      .maybeSingle();
    if (existing) throw new Error("You are already enrolled in this class");

    const { error: je } = await supabaseAdmin
      .from("class_members")
      .insert({ class_id: cls.id, student_id: userId });
    if (je) throw new Error(je.message);

    return { classId: cls.id, className: cls.name };
  });
