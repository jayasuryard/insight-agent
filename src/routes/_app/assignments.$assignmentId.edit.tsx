import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Sparkles, Wand2, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { generateQuestions, insertGeneratedQuestions, getAssignmentAnalytics } from "@/lib/teacher.functions";

export const Route = createFileRoute("/_app/assignments/$assignmentId/edit")({
  component: EditAssignment,
});

type QType = "mcq" | "text";

function EditAssignment() {
  const { assignmentId } = Route.useParams();
  const qc = useQueryClient();

  const { data: assignment } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: questions } = useQuery({
    queryKey: ["questions", assignmentId],
    queryFn: async () => {
      const { data } = await supabase.from("questions").select("*").eq("assignment_id", assignmentId).order("position");
      return data ?? [];
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["submissions", assignmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id, student_id, total_score, max_score, status, submitted_at, profiles:student_id(full_name, email)")
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false });
      return data ?? [];
    },
  });

  const [type, setType] = useState<QType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);
  const [modelAnswer, setModelAnswer] = useState("");
  const [rubric, setRubric] = useState("");
  const [points, setPoints] = useState(1);

  const reset = () => {
    setPrompt(""); setOptions(["", "", "", ""]); setCorrectIdx(0);
    setModelAnswer(""); setRubric(""); setPoints(1);
  };

  const addQuestion = async () => {
    if (!prompt.trim()) return toast.error("Prompt required");
    const position = (questions?.length ?? 0);
    const payload: any = {
      assignment_id: assignmentId,
      type,
      prompt: prompt.trim(),
      points,
      position,
    };
    if (type === "mcq") {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) return toast.error("Add at least 2 options");
      payload.options = cleaned;
      payload.correct_answer = String(Math.min(correctIdx, cleaned.length - 1));
    } else {
      payload.model_answer = modelAnswer.trim() || null;
      payload.rubric = rubric.trim() || null;
    }
    const { error } = await supabase.from("questions").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Question added");
    reset();
    qc.invalidateQueries({ queryKey: ["questions", assignmentId] });
  };

  const deleteQuestion = async (id: string) => {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["questions", assignmentId] });
  };

  return (
    <div className="space-y-6">
      <Link
        to="/classes/$classId"
        params={{ classId: assignment?.class_id ?? "" }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to class
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{assignment?.title ?? "…"}</h1>
          {assignment?.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}
        </div>
        <AIGeneratorDialog assignmentId={assignmentId} onInserted={() => qc.invalidateQueries({ queryKey: ["questions", assignmentId] })} />
      </div>

      <Analytics assignmentId={assignmentId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Questions ({questions?.length ?? 0})</h2>
          {!questions?.length ? (
            <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              No questions yet. Add some →
            </p>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{q.type} · {q.points} pt</span>
                    <p className="mt-1 font-medium">{i + 1}. {q.prompt}</p>
                    {q.type === "mcq" && Array.isArray(q.options) && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {(q.options as string[]).map((o, idx) => (
                          <li key={idx} className={idx === Number(q.correct_answer) ? "text-success font-medium" : "text-muted-foreground"}>
                            {String.fromCharCode(65 + idx)}. {o}
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.type === "text" && q.model_answer && (
                      <p className="mt-2 text-xs text-muted-foreground"><strong>Model:</strong> {q.model_answer}</p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Add a question</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as QType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple choice</SelectItem>
                  <SelectItem value="text">Short answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Points</Label>
              <Input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Number(e.target.value) || 1)} />
            </div>
          </div>
          <div>
            <Label>Prompt</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} />
          </div>
          {type === "mcq" ? (
            <div className="space-y-2">
              <Label>Options (mark the correct one)</Label>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={correctIdx === i}
                    onChange={() => setCorrectIdx(i)}
                    className="h-4 w-4 accent-primary"
                  />
                  <Input
                    value={o}
                    onChange={(e) => setOptions(options.map((x, idx) => (idx === i ? e.target.value : x)))}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <Label>Model answer (used by AI as reference)</Label>
                <Textarea value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Rubric (optional)</Label>
                <Textarea value={rubric} onChange={(e) => setRubric(e.target.value)} rows={2} placeholder="e.g. Award full marks for clear definition + relevant example." />
              </div>
            </>
          )}
          <Button onClick={addQuestion} className="w-full"><Plus className="mr-2 h-4 w-4" /> Add question</Button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Submissions
        </h2>
        {!submissions?.length ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            No submissions yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s: any) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3">{s.profiles?.full_name ?? s.profiles?.email ?? "Student"}</td>
                    <td className="px-4 py-3 capitalize">{s.status}</td>
                    <td className="px-4 py-3">{s.total_score != null ? `${Number(s.total_score)} / ${Number(s.max_score)}` : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
