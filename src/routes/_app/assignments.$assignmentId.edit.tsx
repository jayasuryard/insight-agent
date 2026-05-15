import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Sparkles, Wand2, BarChart3, Pencil, Save } from "lucide-react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { generateQuestions, insertGeneratedQuestions, getAssignmentAnalytics } from "@/lib/teacher.functions";

export const Route = createFileRoute("/_app/assignments/$assignmentId/edit")({
  component: EditAssignment,
});

type QType = "mcq" | "text";

function EditAssignment() {
  const { assignmentId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const deleteAssignment = async () => {
    // Delete answers → submissions → questions → assignment
    const { data: subs } = await supabase.from("submissions").select("id").eq("assignment_id", assignmentId);
    const subIds = (subs ?? []).map((s) => s.id);
    if (subIds.length) {
      await supabase.from("answers").delete().in("submission_id", subIds);
      await supabase.from("submissions").delete().eq("assignment_id", assignmentId);
    }
    await supabase.from("questions").delete().eq("assignment_id", assignmentId);
    const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
    if (error) return toast.error(error.message);
    toast.success("Assignment deleted");
    navigate({ to: "/classes/$classId", params: { classId: assignment?.class_id ?? "" } });
  };

  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDueAt, setNewDueAt] = useState("");

  const saveAssignmentDetails = async () => {
    const updates: any = {};
    if (newTitle.trim()) updates.title = newTitle.trim();
    if (newDesc !== undefined) updates.description = newDesc.trim() || null;
    if (newDueAt !== undefined) updates.due_at = newDueAt || null;
    const { error } = await supabase.from("assignments").update(updates).eq("id", assignmentId);
    if (error) return toast.error(error.message);
    toast.success("Assignment updated");
    setEditingTitle(false);
    qc.invalidateQueries({ queryKey: ["assignment", assignmentId] });
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
          {editingTitle ? (
            <div className="space-y-2">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Assignment title" />
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} placeholder="Description (optional)" />
              <Input type="datetime-local" value={newDueAt} onChange={(e) => setNewDueAt(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveAssignmentDetails}><Save className="mr-1 h-3.5 w-3.5" /> Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingTitle(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-semibold">{assignment?.title ?? "…"}</h1>
              {assignment?.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}
              {assignment?.due_at && (
                <p className="mt-1 text-xs text-muted-foreground">Due: {new Date(assignment.due_at).toLocaleString()}</p>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setNewTitle(assignment?.title ?? ""); setNewDesc(assignment?.description ?? ""); setNewDueAt(assignment?.due_at ? new Date(assignment.due_at).toISOString().slice(0, 16) : ""); setEditingTitle(true); }}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete assignment?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete this assignment and all submissions. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={deleteAssignment}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AIGeneratorDialog assignmentId={assignmentId} onInserted={() => qc.invalidateQueries({ queryKey: ["questions", assignmentId] })} />
        </div>
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
                  <tr
                    key={s.id}
                    className="cursor-pointer border-t border-border transition hover:bg-secondary/40"
                    onClick={() => { window.location.href = `/submissions/${s.id}`; }}
                  >
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

function Analytics({ assignmentId }: { assignmentId: string }) {
  const fn = useServerFn(getAssignmentAnalytics);
  const { data } = useQuery({
    queryKey: ["analytics", assignmentId],
    queryFn: () => fn({ data: { assignmentId } }),
  });
  if (!data) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <BarChart3 className="h-4 w-4 text-primary" /> Analytics
      </h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Enrolled" value={data.enrolled} />
        <Metric label="Completed" value={`${data.completed} (${data.completionRate}%)`} />
        <Metric label="Avg score" value={`${data.avgPct}%`} />
        <Metric label="Hardest Q" value={data.hardest ? `${data.hardest.avgPct}%` : "—"} />
      </div>
      {data.hardest && (
        <p className="mt-3 text-xs text-muted-foreground">
          Hardest: <span className="text-foreground">{data.hardest.prompt}</span>
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}

function AIGeneratorDialog({ assignmentId, onInserted }: { assignmentId: string; onInserted: () => void }) {
  const generate = useServerFn(generateQuestions);
  const insert = useServerFn(insertGeneratedQuestions);
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [mcqCount, setMcqCount] = useState(3);
  const [textCount, setTextCount] = useState(2);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<{ mcq: any[]; text: any[] } | null>(null);

  const run = async () => {
    if (!topic.trim()) return toast.error("Topic required");
    setBusy(true);
    try {
      const res = await generate({ data: { assignmentId, topic: topic.trim(), mcqCount, textCount, difficulty } });
      setDrafts(res);
    } catch (e: any) { toast.error(e?.message ?? "Generation failed"); }
    finally { setBusy(false); }
  };

  const accept = async () => {
    if (!drafts) return;
    setBusy(true);
    try {
      const res = await insert({
        data: {
          assignmentId,
          mcq: drafts.mcq.map((m) => ({ ...m, points: 1 })),
          text: drafts.text.map((t) => ({ ...t, points: 2 })),
        },
      });
      toast.success(`Inserted ${res.inserted} questions`);
      setDrafts(null); setTopic(""); setOpen(false);
      onInserted();
    } catch (e: any) { toast.error(e?.message ?? "Insert failed"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDrafts(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Wand2 className="mr-2 h-4 w-4" /> Generate with AI</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>AI question generator</DialogTitle></DialogHeader>
        {!drafts ? (
          <div className="space-y-3">
            <div>
              <Label>Topic / learning objective</Label>
              <Textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={2} placeholder="e.g. Photosynthesis basics for grade 8" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>MCQ</Label>
                <Input type="number" min={0} max={10} value={mcqCount} onChange={(e) => setMcqCount(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Text</Label>
                <Input type="number" min={0} max={10} value={textCount} onChange={(e) => setTextCount(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={run} disabled={busy}>{busy ? "Generating…" : "Generate"}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Review the drafts and accept to add them.</p>
            {drafts.mcq.map((m, i) => (
              <div key={`m${i}`} className="rounded-lg border border-border p-3">
                <p className="font-medium">MCQ. {m.prompt}</p>
                <ul className="mt-1 space-y-0.5">
                  {m.options.map((o: string, idx: number) => (
                    <li key={idx} className={idx === m.correctIndex ? "text-success" : "text-muted-foreground"}>
                      {String.fromCharCode(65 + idx)}. {o}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {drafts.text.map((t, i) => (
              <div key={`t${i}`} className="rounded-lg border border-border p-3">
                <p className="font-medium">Short. {t.prompt}</p>
                <p className="mt-1 text-xs text-muted-foreground"><strong>Model:</strong> {t.modelAnswer}</p>
              </div>
            ))}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDrafts(null)} disabled={busy}>Regenerate</Button>
              <Button onClick={accept} disabled={busy}>{busy ? "Saving…" : "Accept & insert"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
