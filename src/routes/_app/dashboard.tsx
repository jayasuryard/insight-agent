import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList, Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, role } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id, role],
    enabled: !!user && !!role,
    queryFn: async () => {
      if (role === "teacher") {
        const [{ count: classes }, { count: assignments }, { count: submissions }] = await Promise.all([
          supabase.from("classes").select("*", { count: "exact", head: true }).eq("teacher_id", user!.id),
          supabase.from("assignments").select("*", { count: "exact", head: true }).eq("teacher_id", user!.id),
          supabase.from("submissions").select("id, assignments!inner(teacher_id)", { count: "exact", head: true }).eq("assignments.teacher_id", user!.id),
        ]);
        return { classes: classes ?? 0, assignments: assignments ?? 0, submissions: submissions ?? 0 };
      }
      if (role === "student") {
        const [{ count: classes }, { data: subs }] = await Promise.all([
          supabase.from("class_members").select("*", { count: "exact", head: true }).eq("student_id", user!.id),
          supabase.from("submissions").select("total_score, max_score").eq("student_id", user!.id).eq("status", "graded"),
        ]);
        const completed = subs?.length ?? 0;
        const totalPct = subs && subs.length
          ? Math.round((subs.reduce((acc, s) => acc + (s.max_score ? (Number(s.total_score) / Number(s.max_score)) * 100 : 0), 0) / subs.length))
          : 0;
        return { classes: classes ?? 0, completed, avg: totalPct };
      }
      // admin
      const [{ count: users }, { count: classes }, { count: assignments }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("classes").select("*", { count: "exact", head: true }),
        supabase.from("assignments").select("*", { count: "exact", head: true }),
      ]);
      return { users: users ?? 0, classes: classes ?? 0, assignments: assignments ?? 0 };
    },
  });

  const greeting = role === "teacher" ? "Your teaching cockpit" : role === "admin" ? "Institution overview" : "Your learning at a glance";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground capitalize">{role}</p>
        <h1 className="font-display text-3xl font-semibold">{greeting}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {role === "teacher" && stats && (
          <>
            <StatCard icon={BookOpen} label="Classes" value={(stats as any).classes ?? 0} />
            <StatCard icon={ClipboardList} label="Assignments" value={(stats as any).assignments ?? 0} />
            <StatCard icon={Sparkles} label="Submissions" value={(stats as any).submissions ?? 0} />
          </>
        )}
        {role === "student" && stats && (
          <>
            <StatCard icon={BookOpen} label="Enrolled classes" value={(stats as any).classes ?? 0} />
            <StatCard icon={ClipboardList} label="Completed" value={(stats as any).completed ?? 0} />
            <StatCard icon={Trophy} label="Average score" value={`${(stats as any).avg ?? 0}%`} />
          </>
        )}
        {role === "admin" && stats && (
          <>
            <StatCard icon={Sparkles} label="Users" value={(stats as any).users ?? 0} />
            <StatCard icon={BookOpen} label="Classes" value={(stats as any).classes ?? 0} />
            <StatCard icon={ClipboardList} label="Assignments" value={(stats as any).assignments ?? 0} />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]">
        <h2 className="font-display text-xl font-semibold">Get going</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {role === "teacher" && "Create a class, write your first assignment, share the join code."}
          {role === "student" && "Join your class with the code your teacher shared, then complete an assignment."}
          {role === "admin" && "Browse classes and assignments across your institution."}
        </p>
        <Link
          to="/classes"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Go to classes →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="font-display text-2xl font-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}
