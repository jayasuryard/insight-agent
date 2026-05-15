import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Shield, Users, BookOpen, ClipboardList, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getAdminOverview, setUserRole } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

const ROLES = ["admin", "teacher", "student"] as const;

function AdminPage() {
  const { role } = useAuth();
  const fn = useServerFn(getAdminOverview);
  const setRole = useServerFn(setUserRole);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn({ data: undefined as never }),
    enabled: role === "admin",
  });

  if (role !== "admin") {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 font-display text-lg">Admins only</p>
      </div>
    );
  }

  const toggle = async (userId: string, r: typeof ROLES[number], grant: boolean) => {
    try {
      await setRole({ data: { userId, role: r, grant } });
      toast.success(`${grant ? "Granted" : "Revoked"} ${r}`);
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin console</h1>
        <p className="mt-1 text-sm text-muted-foreground">Institution-wide overview and role management.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Users" value={data.stats.userCount} />
        <Stat icon={BookOpen} label="Classes" value={data.stats.classCount} />
        <Stat icon={ClipboardList} label="Assignments" value={data.stats.assignmentCount} />
        <Stat icon={Sparkles} label="Submissions" value={data.stats.submissionCount} />
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roles</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u: any) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {ROLES.map((r) => {
                          const has = u.roles.includes(r);
                          return (
                            <button
                              key={r}
                              onClick={() => toggle(u.id, r, !has)}
                              className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                                has ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                              }`}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="classes" className="mt-4">
          <SimpleTable
            cols={["Name", "Code", "Created"]}
            rows={data.classes.map((c: any) => [c.name, c.code, new Date(c.created_at).toLocaleDateString()])}
          />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <SimpleTable
            cols={["Title", "Created"]}
            rows={data.assignments.map((a: any) => [a.title, new Date(a.created_at).toLocaleDateString()])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
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

function SimpleTable({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>{cols.map((c) => <th key={c} className="px-4 py-3">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-4 py-6 text-muted-foreground" colSpan={cols.length}>None.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((v, j) => <td key={j} className="px-4 py-3">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
