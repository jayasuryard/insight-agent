import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, KeyRound, Trash2, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { joinClassByCode } from "@/lib/student.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/classes")({
  component: ClassesPage,
});

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function ClassesPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const childMatches = useChildMatches();
  const joinFn = useServerFn(joinClassByCode);

  // When viewing a class detail, render it instead of the list
  if (childMatches.length > 0) return <Outlet />;

  const { data: classes, isLoading } = useQuery({
    queryKey: ["classes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, code, teacher_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");

  const createClass = async () => {
    if (!name.trim() || !user) return;
    const { error } = await supabase.from("classes").insert({
      name: name.trim(),
      code: generateCode(),
      teacher_id: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Class created");
    setName("");
    setCreateOpen(false);
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  const joinClass = async () => {
    if (!code.trim()) return;
    try {
      const res = await joinFn({ data: { code: code.trim() } });
      toast.success(`Joined "${res.className}"`);
      setCode("");
      setJoinOpen(false);
      qc.invalidateQueries({ queryKey: ["classes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to join class");
    }
  };

  const deleteClass = async (classId: string) => {
    const { error } = await supabase.from("classes").delete().eq("id", classId);
    if (error) return toast.error(error.message);
    toast.success("Class deleted");
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  const renameClass = async () => {
    if (!editName.trim() || !editId) return;
    const { error } = await supabase.from("classes").update({ name: editName.trim() }).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Class renamed");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "teacher" ? "Classes you teach." : role === "student" ? "Classes you're enrolled in." : "All classes."}
          </p>
        </div>
        <div className="flex gap-2">
          {role === "student" && (
            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><KeyRound className="mr-2 h-4 w-4" /> Join class</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Join a class</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="code">Class code</Label>
                  <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
                </div>
                <DialogFooter>
                  <Button onClick={joinClass}>Join</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {(role === "teacher" || role === "admin") && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New class</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create class</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="name">Class name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Intro to ML — Fall 25" />
                </div>
                <DialogFooter>
                  <Button onClick={createClass}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !classes?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-display text-lg">No classes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "teacher" ? "Create your first class above." : "Join a class with a code from your teacher."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <div key={c.id} className="group relative rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] transition hover:border-primary/40 hover:shadow-[var(--shadow-warm)]">
              <Link
                to="/classes/$classId"
                params={{ classId: c.id }}
                className="block"
              >
                <div className="flex items-start justify-between">
                  <BookOpen className="h-6 w-6 text-primary" />
                  <code className="rounded-md bg-secondary px-2 py-1 font-mono text-xs">{c.code}</code>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold group-hover:text-primary">{c.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Created {new Date(c.created_at).toLocaleDateString()}
                </p>
              </Link>
              {(role === "teacher" && c.teacher_id === user?.id) || role === "admin" ? (
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.preventDefault(); setEditId(c.id); setEditName(c.name); setEditOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={(e) => e.preventDefault()}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete class?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete "{c.name}". This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteClass(c.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename class</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>New name</Label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={renameClass}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
