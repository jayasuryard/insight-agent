import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---- Helpers ---------------------------------------------------------------

async function ensureStudentAccess(userId: string, assignmentId: string) {
  const { data: a, error } = await supabaseAdmin
    .from("assignments")
    .select("id, class_id, title, description, due_at")
    .eq("id", assignmentId)
    .single();
  if (error || !a) throw new Error("Assignment not found");

  const { data: m } = await supabaseAdmin
    .from("class_members")
    .select("id")
    .eq("class_id", a.class_id)
    .eq("student_id", userId)
    .maybeSingle();
  if (!m) throw new Error("You are not enrolled in this class");
  return a;
}

async function gradeTextWithAI(opts: {
  prompt: string;
  modelAnswer: string | null;
  rubric: string | null;
  response: string;
  points: number;
}): Promise<{ score: number; feedback: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      score: 0,
      feedback: "AI grading unavailable: server misconfiguration.",
    };
  }

  const system = `You are an expert teaching assistant grading short-answer responses.
Return a numeric score from 0 to ${opts.points} (decimals allowed), and concise, constructive feedback (2-4 sentences).
Be fair, focus on accuracy, completeness, and clarity. If a model answer is provided, use it as the gold standard but allow for valid alternative phrasings.`;

  const user = `Question: ${opts.prompt}
Max points: ${opts.points}
${opts.modelAnswer ? `Model answer: ${opts.modelAnswer}\n` : ""}${opts.rubric ? `Rubric: ${opts.rubric}\n` : ""}
Student response: ${opts.response || "(blank)"}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "grade_response",
            description: "Provide a score and feedback for a student's answer.",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: `Score from 0 to ${opts.points}` },
                feedback: { type: "string", description: "Concise constructive feedback" },
              },
              required: ["score", "feedback"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "grade_response" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("AI grading failed", resp.status, t);
    if (resp.status === 429) return { score: 0, feedback: "Grading rate-limited; please retry." };
    if (resp.status === 402) return { score: 0, feedback: "AI credits exhausted. Contact admin." };
    return { score: 0, feedback: "AI grading temporarily unavailable." };
  }

  const json = await resp.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { score: 0, feedback: "Unable to parse AI grading output." };
  try {
    const parsed = JSON.parse(args) as { score: number; feedback: string };
    const clamped = Math.max(0, Math.min(opts.points, Number(parsed.score) || 0));
    return { score: clamped, feedback: String(parsed.feedback ?? "") };
  } catch {
    return { score: 0, feedback: "Unable to parse AI grading output." };
  }
}

// ---- Server functions ------------------------------------------------------

/** Fetch sanitized assignment + questions for a student (no answer keys). */
export const getAssignmentForStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ assignmentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const a = await ensureStudentAccess(userId, data.assignmentId);

    const { data: questions } = await supabaseAdmin
      .from("questions")
      .select("id, type, prompt, options, points, position")
      .eq("assignment_id", data.assignmentId)
      .order("position", { ascending: true });

    // Existing submission?
    const { data: sub } = await supabaseAdmin
      .from("submissions")
      .select("id, status, total_score, max_score, overall_feedback, submitted_at")
      .eq("assignment_id", data.assignmentId)
      .eq("student_id", userId)
      .maybeSingle();

    let answers: Array<{ question_id: string; response: string | null; score: number | null; feedback: string | null; is_correct: boolean | null }> = [];
    if (sub) {
      const { data: ans } = await supabaseAdmin
        .from("answers")
        .select("question_id, response, score, feedback, is_correct")
        .eq("submission_id", sub.id);
      answers = ans ?? [];
    }

    return { assignment: a, questions: questions ?? [], submission: sub, answers };
  });

/** Submit answers, auto-grade MCQ, AI-grade text, persist results. */
export const submitAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      assignmentId: z.string().uuid(),
      answers: z.array(
        z.object({
          questionId: z.string().uuid(),
          response: z.string().max(10000),
        }),
      ),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await ensureStudentAccess(userId, data.assignmentId);

    const { data: questions, error: qe } = await supabaseAdmin
      .from("questions")
      .select("*")
      .eq("assignment_id", data.assignmentId)
      .order("position");
    if (qe || !questions) throw new Error("Could not load questions");

    // Upsert submission
    const { data: sub, error: se } = await supabaseAdmin
      .from("submissions")
      .upsert(
        {
          assignment_id: data.assignmentId,
          student_id: userId,
          status: "graded",
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" },
      )
      .select()
      .single();
    if (se || !sub) throw new Error("Could not create submission");

    let total = 0;
    let max = 0;
    const responsesMap = new Map(data.answers.map((a) => [a.questionId, a.response]));

    for (const q of questions) {
      max += q.points;
      const response = responsesMap.get(q.id) ?? "";
      let score = 0;
      let feedback = "";
      let isCorrect: boolean | null = null;

      if (q.type === "mcq") {
        const correct = String(q.correct_answer ?? "").trim();
        isCorrect = response.trim() === correct && correct.length > 0;
        score = isCorrect ? q.points : 0;
        const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
        const correctText = opts[Number(correct)] ?? correct;
        feedback = isCorrect
          ? "Correct!"
          : response
            ? `Incorrect. The correct answer is: ${correctText}`
            : `No answer given. The correct answer is: ${correctText}`;
      } else {
        const graded = await gradeTextWithAI({
          prompt: q.prompt,
          modelAnswer: q.model_answer,
          rubric: q.rubric,
          response,
          points: q.points,
        });
        score = graded.score;
        feedback = graded.feedback;
        isCorrect = score >= q.points * 0.7;
      }

      total += score;

      await supabaseAdmin.from("answers").upsert(
        {
          submission_id: sub.id,
          question_id: q.id,
          response,
          score,
          feedback,
          is_correct: isCorrect,
        },
        { onConflict: "submission_id,question_id" },
      );
    }

    const pct = max > 0 ? (total / max) * 100 : 0;
    const overall =
      pct >= 90 ? "Outstanding work — you've clearly mastered this material."
      : pct >= 75 ? "Strong submission. Review the per-question feedback to push toward mastery."
      : pct >= 50 ? "Decent effort. Focus on the weaker areas highlighted in the feedback."
      : "Plenty of room to grow — revisit the topics flagged in your feedback and try again.";

    await supabaseAdmin
      .from("submissions")
      .update({ total_score: total, max_score: max, overall_feedback: overall })
      .eq("id", sub.id);

    return { submissionId: sub.id, total, max, overall };
  });
