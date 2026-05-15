import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList, Plus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { createAssignment as createAssignmentFn } from "@/lib/teacher.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/classes/$classId")({
  component: ClassDetail,
});

function ClassDetail() {
  const { classId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createAssignmentSvr = useServerFn(createAssignmentFn);

  const { data: cls } = useQuery({
    queryKey: ["class", classId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").eq("id", classId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["assignments", classId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, description, due_at, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members } = useQuery({
    queryKey: ["class-members", classId],
    enabled: !!user,
    queryFn: async () => {
      // Fetch members + profiles separately (student_id → auth.users, no direct FK to profiles)
      const { data: memberRows } = await supabase
        .from("class_members")
        .select("student_id")
        .eq("class_id", classId);
      if (!memberRows?.length) return [];
      const ids = memberRows.map((m) => m.student_id);
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
      return memberRows.map((m) => ({ student_id: m.student_id, profiles: profileMap.get(m.student_id) ?? null }));
    },
  });

  const isTeacher = !!cls && (cls.teacher_id === user?.id || role === "admin");

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");

  const createAssignment = async () => {
    if (!title.trim() || !cls) return;
    try {
      const res = await createAssignmentSvr({
        data: {
          classId: cls.id,
          title: title.trim(),
          description: description.trim() || undefined,
          dueAt: dueAt || undefined,
        },
      });
      toast.success("Assignment created");
      setTitle(""); setDescription(""); setDueAt(""); setOpen(false);
      qc.invalidateQueries({ queryKey: ["assignments", classId] });
      navigate({ to: "/assignments/$assignmentId/edit", params: { assignmentId: res.assignmentId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create assignment");
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All classes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{cls?.name ?? "…"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Class code: <code className="rounded bg-secondary px-2 py-0.5 font-mono">{cls?.code}</code>
          </p>
        </div>
        {isTeacher && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New assignment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New assignment</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz 1 — Foundations" />
                </div>
                <div>
                  <Label htmlFor="desc">Description (optional)</Label>
                  <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
                <div>
                  <Label htmlFor="due">Due date (optional)</Label>
                  <Input id="due" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createAssignment}>Create & add questions</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-display text-lg font-semibold">Assignments</h2>
          {!assignments?.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">No assignments yet.</p>
            </div>
          ) : (
            assignments.map((a) => (
              <Link
                key={a.id}
                to={isTeacher ? "/assignments/$assignmentId/edit" : "/assignments/$assignmentId/take"}
                params={{ assignmentId: a.id }}
                className="block rounded-xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-base font-semibold">{a.title}</h3>
                    {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                    {a.due_at && (
                      <p className={`mt-1 text-xs ${new Date(a.due_at) < new Date() ? "text-destructive" : "text-muted-foreground"}`}>
                        Due: {new Date(a.due_at).toLocaleString()}
                        {new Date(a.due_at) < new Date() && " (overdue)"}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))
          )}
        </div>

        <div>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <Users className="h-4 w-4" /> Members ({members?.length ?? 0})
          </h2>
          <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
            {!members?.length ? (
              <p className="text-sm text-muted-foreground">No students yet.</p>
            ) : (
              members.map((m: any) => (
                <div key={m.student_id} className="flex items-center justify-between text-sm">
                  <span>{m.profiles?.full_name ?? "Student"}</span>
                  <span className="text-xs text-muted-foreground">{m.profiles?.email}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
