import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSubmissionDetail, overrideAnswer } from "@/lib/teacher.functions";

export const Route = createFileRoute("/_app/submissions/$submissionId")({
  component: SubmissionDetail,
});

function SubmissionDetail() {
  const { submissionId } = Route.useParams();
  const fetchFn = useServerFn(getSubmissionDetail);
  const overrideFn = useServerFn(overrideAnswer);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: () => fetchFn({ data: { submissionId } }),
  });

  const [edits, setEdits] = useState<Record<string, { score: number; feedback: string }>>({});

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const sub: any = data.submission;
  const qById = new Map(data.questions.map((q: any) => [q.id, q]));

  const save = async (answerId: string) => {
    const e = edits[answerId];
    if (!e) return;
    try {
      await overrideFn({ data: { answerId, score: e.score, feedback: e.feedback } });
      toast.success("Override saved");
      setEdits((s) => { const n = { ...s }; delete n[answerId]; return n; });
      qc.invalidateQueries({ queryKey: ["submission", submissionId] });
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/assignments/$assignmentId/edit"
        params={{ assignmentId: sub.assignments.id }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to assignment
      </Link>

      <div>
        <p className="text-sm text-muted-foreground">{sub.profiles?.full_name ?? sub.profiles?.email}</p>
        <h1 className="font-display text-3xl font-semibold">{sub.assignments.title}</h1>
        <p className="mt-2 font-display text-xl">
          {Number(sub.total_score)} / {Number(sub.max_score)}
          <span className="ml-2 text-sm text-muted-foreground">
            ({sub.max_score ? Math.round((Number(sub.total_score) / Number(sub.max_score)) * 100) : 0}%)
          </span>
        </p>
        {sub.overall_feedback && (
          <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary shrink-0" /> {sub.overall_feedback}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {data.answers.map((a: any) => {
          const q: any = qById.get(a.question_id);
          if (!q) return null;
          const edit = edits[a.id];
          const score = edit?.score ?? Number(a.score ?? 0);
          const feedback = edit?.feedback ?? (a.feedback ?? "");
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-base font-medium">{q.prompt}</p>
                <span className="text-xs text-muted-foreground">{q.points} pt</span>
              </div>

              {q.type === "mcq" ? (
                <div className="mt-3 text-sm">
                  <p className="text-muted-foreground">
                    Student picked: <span className="font-medium text-foreground">
                      {a.response !== null && a.response !== "" ? (q.options as string[])[Number(a.response)] : "(blank)"}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    Correct: <span className="font-medium text-success">{(q.options as string[])[Number(q.correct_answer)]}</span>
                  </p>
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Response</span>
                    <p className="rounded-lg bg-secondary/40 p-3">{a.response || <em>(blank)</em>}</p>
                  </div>
                  {q.model_answer && (
                    <div>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Model answer</span>
                      <p className="rounded-lg bg-secondary/40 p-3 text-muted-foreground">{q.model_answer}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-[120px_1fr_auto] md:items-end">
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Score</label>
                  <Input
                    type="number" min={0} max={q.points} step="0.5"
                    value={score}
                    onChange={(e) => setEdits((s) => ({ ...s, [a.id]: { score: Number(e.target.value), feedback: edit?.feedback ?? a.feedback ?? "" } }))}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Feedback</label>
                  <Textarea
                    rows={2}
                    value={feedback}
                    onChange={(e) => setEdits((s) => ({ ...s, [a.id]: { score: edit?.score ?? Number(a.score ?? 0), feedback: e.target.value } }))}
                  />
                </div>
                <Button size="sm" disabled={!edit} onClick={() => save(a.id)}>
                  <Save className="mr-1 h-4 w-4" /> Save
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
