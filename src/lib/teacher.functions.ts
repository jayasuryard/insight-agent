import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureTeacherOwnsAssignment(userId: string, assignmentId: string) {
  const { data, error } = await supabaseAdmin
    .from("assignments")
    .select("id, teacher_id, class_id, title")
    .eq("id", assignmentId)
    .single();
  if (error || !data) throw new Error("Assignment not found");
  if (data.teacher_id !== userId) {
    // allow admin
    const { data: r } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!r) throw new Error("Forbidden");
  }
  return data;
}

/** AI generates draft questions for an assignment. Teacher inserts after review. */
export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      assignmentId: z.string().uuid(),
      topic: z.string().min(2).max(500),
      mcqCount: z.number().int().min(0).max(10),
      textCount: z.number().int().min(0).max(10),
      difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureTeacherOwnsAssignment(context.userId, data.assignmentId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const system = `You are an expert curriculum designer. Generate clean, pedagogically sound assessment questions.`;
    const user = `Topic: ${data.topic}
Difficulty: ${data.difficulty}
Generate exactly ${data.mcqCount} multiple-choice questions (each with 4 options and one correct index 0-3) and ${data.textCount} short-answer questions (each with a model answer). Keep prompts concise and unambiguous.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_questions",
            description: "Return draft questions",
            parameters: {
              type: "object",
              properties: {
                mcq: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      prompt: { type: "string" },
                      options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                      correctIndex: { type: "integer", minimum: 0, maximum: 3 },
                    },
                    required: ["prompt", "options", "correctIndex"],
                  },
                },
                text: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      prompt: { type: "string" },
                      modelAnswer: { type: "string" },
                    },
                    required: ["prompt", "modelAnswer"],
                  },
                },
              },
              required: ["mcq", "text"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_questions" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) throw new Error("AI rate limit — try again in a moment.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
      throw new Error("AI generation failed");
    }
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = JSON.parse(args ?? "{}") as { mcq: any[]; text: any[] };
    return { mcq: parsed.mcq ?? [], text: parsed.text ?? [] };
  });

/** Insert reviewed/approved drafts as questions. */
export const insertGeneratedQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      assignmentId: z.string().uuid(),
      mcq: z.array(z.object({
        prompt: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        points: z.number().int().min(1).max(100).default(1),
      })),
      text: z.array(z.object({
        prompt: z.string().min(1),
        modelAnswer: z.string().min(1),
        points: z.number().int().min(1).max(100).default(2),
      })),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ensureTeacherOwnsAssignment(context.userId, data.assignmentId);
    const { count } = await supabaseAdmin
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", data.assignmentId);
    let pos = count ?? 0;
    const rows: any[] = [];
    for (const m of data.mcq) {
      rows.push({
        assignment_id: data.assignmentId, type: "mcq", prompt: m.prompt,
        options: m.options, correct_answer: String(m.correctIndex), points: m.points, position: pos++,
      });
    }
    for (const t of data.text) {
      rows.push({
        assignment_id: data.assignmentId, type: "text", prompt: t.prompt,
        model_answer: t.modelAnswer, points: t.points, position: pos++,
      });
    }
    if (!rows.length) return { inserted: 0 };
    const { error } = await supabaseAdmin.from("questions").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

/** Submission detail with all answers, questions, student name. */
export const getSubmissionDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ submissionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sub, error } = await supabaseAdmin
      .from("submissions")
      .select("*, assignments!inner(id, title, teacher_id, class_id), profiles:student_id(full_name, email)")
      .eq("id", data.submissionId)
      .single();
    if (error || !sub) throw new Error("Submission not found");
    if ((sub as any).assignments.teacher_id !== context.userId) {
      const { data: r } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
      if (!r) throw new Error("Forbidden");
    }
    const [{ data: questions }, { data: answers }] = await Promise.all([
      supabaseAdmin.from("questions").select("*").eq("assignment_id", (sub as any).assignment_id).order("position"),
      supabaseAdmin.from("answers").select("*").eq("submission_id", data.submissionId),
    ]);
    return { submission: sub, questions: questions ?? [], answers: answers ?? [] };
  });

/** Teacher overrides a single answer's score/feedback and recomputes total. */
export const overrideAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      answerId: z.string().uuid(),
      score: z.number().min(0),
      feedback: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ans, error } = await supabaseAdmin
      .from("answers")
      .select("id, submission_id, question_id")
      .eq("id", data.answerId).single();
    if (error || !ans) throw new Error("Answer not found");

    const { data: sub } = await supabaseAdmin
      .from("submissions").select("assignment_id").eq("id", ans.submission_id).single();
    const { data: a } = await supabaseAdmin
      .from("assignments").select("teacher_id").eq("id", sub!.assignment_id).single();
    if (a!.teacher_id !== context.userId) {
      const { data: r } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
      if (!r) throw new Error("Forbidden");
    }
    const { data: q } = await supabaseAdmin.from("questions").select("points").eq("id", ans.question_id).single();
    const clamped = Math.max(0, Math.min(q!.points, data.score));
    await supabaseAdmin.from("answers").update({
      score: clamped,
      feedback: data.feedback ?? undefined,
      is_correct: clamped >= q!.points * 0.7,
    }).eq("id", data.answerId);

    // Recompute submission total
    const { data: all } = await supabaseAdmin
      .from("answers").select("score").eq("submission_id", ans.submission_id);
    const total = (all ?? []).reduce((acc, r: any) => acc + Number(r.score ?? 0), 0);
    await supabaseAdmin.from("submissions").update({ total_score: total }).eq("id", ans.submission_id);
    return { score: clamped, total };
  });

/** Class analytics for teacher: avg score, completion rate, hardest question. */
export const getAssignmentAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await ensureTeacherOwnsAssignment(context.userId, data.assignmentId);

    const { data: a } = await supabaseAdmin
      .from("assignments").select("class_id").eq("id", data.assignmentId).single();
    const { count: enrolled } = await supabaseAdmin
      .from("class_members").select("*", { count: "exact", head: true }).eq("class_id", a!.class_id);
    const { data: subs } = await supabaseAdmin
      .from("submissions").select("id, total_score, max_score, status")
      .eq("assignment_id", data.assignmentId).eq("status", "graded");

    const completed = subs?.length ?? 0;
    const avgPct = completed
      ? Math.round((subs!.reduce((acc, s: any) => acc + (s.max_score ? (Number(s.total_score) / Number(s.max_score)) * 100 : 0), 0) / completed))
      : 0;

    const { data: questions } = await supabaseAdmin
      .from("questions").select("id, prompt, points, position").eq("assignment_id", data.assignmentId).order("position");
    const subIds = (subs ?? []).map((s) => s.id);
    let perQuestion: Array<{ id: string; prompt: string; avgPct: number }> = [];
    if (subIds.length && questions?.length) {
      const { data: ans } = await supabaseAdmin
        .from("answers").select("question_id, score").in("submission_id", subIds);
      const map = new Map<string, { sum: number; n: number }>();
      for (const a of ans ?? []) {
        const cur = map.get(a.question_id) ?? { sum: 0, n: 0 };
        cur.sum += Number(a.score ?? 0); cur.n += 1;
        map.set(a.question_id, cur);
      }
      perQuestion = questions.map((q) => {
        const m = map.get(q.id);
        return {
          id: q.id, prompt: q.prompt,
          avgPct: m && m.n > 0 ? Math.round((m.sum / (q.points * m.n)) * 100) : 0,
        };
      });
    }
    const hardest = perQuestion.length ? perQuestion.reduce((a, b) => (a.avgPct < b.avgPct ? a : b)) : null;

    return {
      enrolled: enrolled ?? 0,
      completed,
      completionRate: enrolled ? Math.round((completed / enrolled) * 100) : 0,
      avgPct,
      hardest,
      perQuestion,
    };
  });
