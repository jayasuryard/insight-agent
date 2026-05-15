import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAssignmentForStudent, submitAssignment } from "@/lib/assignments.functions";

export const Route = createFileRoute("/_app/assignments/$assignmentId/take")({
  component: TakeAssignment,
});

function TakeAssignment() {
  const { assignmentId } = Route.useParams();
  const fetchFn = useServerFn(getAssignmentForStudent);
  const submitFn = useServerFn(submitAssignment);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["take", assignmentId],
    queryFn: () => fetchFn({ data: { assignmentId } }),
  });

  const [responses, setResponses] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data?.answers?.length) {
      const map: Record<string, string> = {};
      for (const a of data.answers) map[a.question_id] = a.response ?? "";
      setResponses(map);
    }
  }, [data]);

  const graded = data?.submission?.status === "graded";
  const answersByQ = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of data?.answers ?? []) m.set(a.question_id, a);
    return m;
  }, [data]);

  const submit = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const payload = data.questions.map((q: any) => ({
        questionId: q.id,
        response: responses[q.id] ?? "",
      }));
      const res = await submitFn({ data: { assignmentId, answers: payload } });
      toast.success(`Graded — ${res.total} / ${res.max}`);
      qc.invalidateQueries({ queryKey: ["take", assignmentId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const { assignment, questions, submission } = data;
  const isPastDue = assignment.due_at ? new Date(assignment.due_at) < new Date() : false;

  return (
    <div className="space-y-6">
      <Link to="/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div>
        <h1 className="font-display text-3xl font-semibold">{assignment.title}</h1>
        {assignment.description && <p className="mt-1 text-sm text-muted-foreground">{assignment.description}</p>}
        {assignment.due_at && (
          <p className={`mt-1 text-sm ${isPastDue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            Due: {new Date(assignment.due_at).toLocaleString()}
            {isPastDue && !graded && " — Submission closed"}
          </p>
        )}
      </div>

      {graded && submission && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <div className="flex items-center gap-2 text-sm text-primary">
            <Sparkles className="h-4 w-4" /> AI evaluation complete
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-4xl font-semibold">
              {Number(submission.total_score)} / {Number(submission.max_score)}
            </span>
            <span className="text-sm text-muted-foreground">
              ({Math.round((Number(submission.total_score) / Number(submission.max_score)) * 100)}%)
            </span>
          </div>
          {submission.overall_feedback && <p className="mt-3 text-sm">{submission.overall_feedback}</p>}
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q: any, i: number) => {
          const ans = answersByQ.get(q.id);
          return (
            <div key={q.id} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-lg font-medium">{i + 1}. {q.prompt}</p>
                <span className="text-xs text-muted-foreground">{q.points} pt</span>
              </div>
              <div className="mt-4">
                {q.type === "mcq" ? (
                  <div className="space-y-2">
                    {(q.options as string[]).map((o, idx) => {
                      const checked = responses[q.id] === String(idx);
                      return (
                        <label
                          key={idx}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                            checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                          } ${graded ? "cursor-default" : ""}`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            disabled={graded}
                            checked={checked}
                            onChange={() => setResponses({ ...responses, [q.id]: String(idx) })}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm">{String.fromCharCode(65 + idx)}. {o}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <Textarea
                    rows={4}
                    disabled={graded}
                    value={responses[q.id] ?? ""}
                    onChange={(e) => setResponses({ ...responses, [q.id]: e.target.value })}
                    placeholder="Type your answer…"
                  />
                )}
              </div>
              {graded && ans && (
                <div className={`mt-4 rounded-lg p-4 text-sm ${ans.is_correct ? "bg-success/10" : "bg-destructive/10"}`}>
                  <div className="flex items-center gap-2 font-medium">
                    {ans.is_correct ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    {Number(ans.score)} / {q.points}
                  </div>
                  {ans.feedback && <p className="mt-1 text-muted-foreground">{ans.feedback}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!graded && (
        <Button size="lg" className="w-full" onClick={submit} disabled={submitting || !questions.length || isPastDue}>
          {isPastDue ? "Submission closed (past due)" : submitting ? "Grading with AI…" : "Submit for AI evaluation"}
        </Button>
      )}
    </div>
  );
}
