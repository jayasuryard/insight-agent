import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, Users, BookOpen, ClipboardList, Sparkles, Trash2, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getAdminOverview,
  setUserRole,
  adminCreateClass,
  adminDeleteClass,
  adminDeleteAssignment,
  adminDeleteUser,
  adminGetSubmissions,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

const ROLES = ["admin", "teacher", "student"] as const;

function AdminPage() {
  const { role } = useAuth();
  const fn = useServerFn(getAdminOverview);
  const setRoleFn = useServerFn(setUserRole);
  const createClassFn = useServerFn(adminCreateClass);
  const deleteClassFn = useServerFn(adminDeleteClass);
  const deleteAssignmentFn = useServerFn(adminDeleteAssignment);
  const deleteUserFn = useServerFn(adminDeleteUser);
  const getSubmissionsFn = useServerFn(adminGetSubmissions);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn({ data: undefined as never }),
    enabled: role === "admin",
  });

  const { data: subsData } = useQuery({
    queryKey: ["admin-submissions"],
    queryFn: () => getSubmissionsFn({ data: undefined as never }),
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
      await setRoleFn({ data: { userId, role: r, grant } });
      toast.success(`${grant ? "Granted" : "Revoked"} ${r}`);
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUserFn({ data: { userId } });
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      await deleteClassFn({ data: { classId } });
      toast.success("Class deleted");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      await deleteAssignmentFn({ data: { assignmentId } });
      toast.success("Assignment deleted");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin console</h1>
        <p className="mt-1 text-sm text-muted-foreground">Institution-wide overview and management.</p>
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
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Actions</th>
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
                    <td className="px-4 py-3">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete user?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete {u.full_name ?? u.email} and all their data. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteUser(u.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="classes" className="mt-4 space-y-4">
          <CreateClassDialog teachers={data.users.filter((u: any) => u.roles.includes("teacher"))} onCreated={() => qc.invalidateQueries({ queryKey: ["admin-overview"] })} createFn={createClassFn} />
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Teacher</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.length === 0 ? (
                  <tr><td className="px-4 py-6 text-muted-foreground" colSpan={5}>No classes yet.</td></tr>
                ) : data.classes.map((c: any) => {
                  const teacher = data.users.find((u: any) => u.id === c.teacher_id);
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3"><code className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">{c.code}</code></td>
                      <td className="px-4 py-3 text-muted-foreground">{teacher?.full_name ?? teacher?.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete class?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{c.name}" and all its assignments, submissions, and data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteClass(c.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Teacher</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.length === 0 ? (
                  <tr><td className="px-4 py-6 text-muted-foreground" colSpan={5}>No assignments yet.</td></tr>
                ) : data.assignments.map((a: any) => {
                  const cls = data.classes.find((c: any) => c.id === a.class_id);
                  const teacher = data.users.find((u: any) => u.id === a.teacher_id);
                  return (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{a.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{cls?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{teacher?.full_name ?? teacher?.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete assignment?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{a.title}" and all its questions, submissions, and answers.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteAssignment(a.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {!subsData?.submissions?.length ? (
                  <tr><td className="px-4 py-6 text-muted-foreground" colSpan={5}>No submissions yet.</td></tr>
                ) : subsData.submissions.map((s: any) => {
                  const pct = s.max_score ? Math.round((Number(s.total_score) / Number(s.max_score)) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-3">{s.profiles?.full_name ?? s.profiles?.email ?? "—"}</td>
                      <td className="px-4 py-3">{s.assignments?.title ?? "—"}</td>
                      <td className="px-4 py-3">
                        {s.total_score != null ? (
                          <span className="font-medium">{Number(s.total_score)}/{Number(s.max_score)} ({pct}%)</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 capitalize">{s.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateClassDialog({ teachers, onCreated, createFn }: { teachers: any[]; onCreated: () => void; createFn: any }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const create = async () => {
    if (!name.trim() || !teacherId) return toast.error("Name and teacher required");
    try {
      const res = await createFn({ data: { name: name.trim(), teacherId } });
      toast.success(`Class created with code: ${res.code}`);
      setName(""); setTeacherId(""); setOpen(false);
      onCreated();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Create class</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create class (admin)</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Class name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Intro to CS — Spring 26" />
          </div>
          <div>
            <Label>Assign to teacher</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name ?? t.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={create}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
