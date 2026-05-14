import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, ClipboardCheck, MessageSquareText, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "EvalAI — AI-powered assignment evaluation" },
      { name: "description", content: "Create MCQ and short-answer assignments. Students get instant AI grading with personalized feedback. Built for institutions." },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="font-display text-xl font-semibold">EvalAI</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
            <Button asChild>
              <Link to="/auth" search={{ mode: "signup" }}>Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                <Sparkles className="h-3.5 w-3.5" /> AI-graded assignments
              </span>
              <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] md:text-6xl">
                Grading that actually <span className="italic text-primary">teaches</span>.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">
                Build MCQ and short-answer assignments in minutes. Students submit and receive instant, rubric-aware feedback — so they learn, not just score.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link to="/auth" search={{ mode: "signup" }}>Create your account</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/auth">I already have an account</Link>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-warm)]">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  Submission graded · 9.2 / 10
                </div>
                <p className="mt-4 font-display text-lg">"Explain the difference between supervised and unsupervised learning."</p>
                <div className="mt-3 rounded-xl bg-secondary/70 p-4 text-sm text-secondary-foreground">
                  Strong answer — clear definitions and a relevant example. To strengthen further, mention how labeled data drives loss functions in supervised settings.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Clarity", "Accuracy", "Depth"].map((t) => (
                    <span key={t} className="rounded-full bg-accent/40 px-3 py-1 text-xs text-accent-foreground">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="font-display text-3xl font-semibold md:text-4xl">A complete agentic platform</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">From classroom setup to AI-powered evaluation, every piece works together.</p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { icon: Users, title: "Roles built in", body: "Admins, teachers, and students each get a tailored dashboard with the right permissions." },
                { icon: ClipboardCheck, title: "MCQ + short answer", body: "Mix auto-graded multiple choice with AI-evaluated short answers in a single assignment." },
                { icon: Brain, title: "Rubric-aware AI", body: "Provide a model answer or rubric and the AI grades against it, returning a score plus actionable feedback." },
                { icon: MessageSquareText, title: "Personalized feedback", body: "Every student gets unique, constructive comments per question — not just a number." },
                { icon: Sparkles, title: "Instant turnaround", body: "Submissions are graded in seconds. Students learn while it's still fresh." },
                { icon: Users, title: "Class codes", body: "Share a 6-character code; students join in one click. No spreadsheets." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">Ready when your class is.</h2>
          <p className="mt-3 text-muted-foreground">Spin up a class, write a few questions, share the code. Your students do the rest.</p>
          <Button size="lg" className="mt-8" asChild>
            <Link to="/auth" search={{ mode: "signup" }}>Get started — it's free</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} EvalAI · Crafted for learning.
      </footer>
    </div>
  );
}
