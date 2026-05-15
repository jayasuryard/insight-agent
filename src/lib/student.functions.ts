import { createServerFn } from "@tanstack/react-start";
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
