import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Sparkles } from "lucide-react";
import { getMyResults } from "@/lib/student.functions";
import { adminGetSubmissions } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/results")({
  component: ResultsPage,
});

function ResultsPage() {
  const { user, role } = useAuth();
  const myResultsFn = useServerFn(getMyResults);
  const adminSubsFn = useServerFn(adminGetSubmissions);
  const isAdmin = role === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["my-results", role],
    enabled: !!user && !!role,
    queryFn: async () => {
      if (isAdmin) {
        const res = await adminSubsFn({ data: undefined as never });
        // Normalise to same shape as getMyResults
        return {
          submissions: res.submissions.map((s: any) => ({
            ...s,
            assignments: s.assignments
              ? { id: s.assignments.id, title: s.assignments.title, classes: null }
              : null,
          })),
        };
      }
      return myResultsFn({ data: undefined as never });
    },
  });

  const heading = isAdmin ? "All submissions" : "My results";
  const subheading = isAdmin
    ? "Every graded submission across all classes."
    : "All graded submissions and AI feedback.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data?.submissions.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-display text-lg">No graded work yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "No submissions have been graded yet." : "Complete an assignment to see results here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.submissions.map((s: any) => {
            const pct = s.max_score ? Math.round((Number(s.total_score) / Number(s.max_score)) * 100) : 0;
            return (
              <Link
                key={s.id}
                to="/assignments/$assignmentId/take"
                params={{ assignmentId: s.assignments?.id ?? "" }}
                className="block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {isAdmin && s.profiles && (
                      <p className="text-xs font-medium text-primary mb-0.5">
                        {s.profiles.full_name ?? s.profiles.email}
                      </p>
                    )}
                    <h3 className="font-display text-base font-semibold">{s.assignments?.title ?? "—"}</h3>
                    <p className="text-xs text-muted-foreground">{s.assignments?.classes?.name ?? ""}</p>
                    {s.overall_feedback && (
                      <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                        <Sparkles className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                        <span>{s.overall_feedback}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-2xl font-semibold">{pct}%</div>
                    <div className="text-xs text-muted-foreground">{Number(s.total_score)} / {Number(s.max_score)}</div>
                    <div className="text-xs text-muted-foreground capitalize mt-0.5">{s.status}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
