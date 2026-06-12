import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Activity, Boxes, ListTodo, Plug, Sparkles, Workflow } from "lucide-react";

const features = [
  {
    icon: Boxes,
    title: "Multi-agent registry",
    body: "Connect Hermes agents deployed anywhere — AWS, GCP, or your laptop — and manage them all from one place.",
  },
  {
    icon: Activity,
    title: "Live activity",
    body: "See everything your agents do in real time: messages, tool calls, status, and errors as they happen.",
  },
  {
    icon: ListTodo,
    title: "Threads & tasks",
    body: "Give agents threads of work and track tasks on a board. Assign, prioritize, and follow through.",
  },
  {
    icon: Sparkles,
    title: "Skills with vector search",
    body: "Save reusable instructions and context. Find the right skill instantly with semantic search.",
  },
  {
    icon: Plug,
    title: "Integrations",
    body: "Wire in Slack, GitHub, and more so your agents act where your work already lives.",
  },
  {
    icon: Workflow,
    title: "Orchestration",
    body: "Compose multi-step, multi-agent workflows — easier than a terminal or a chat app.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/20 text-accent">
            ⬢
          </span>
          Hermes Control Plane
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">
                Get started
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
            >
              Open dashboard
            </Link>
          </SignedIn>
        </nav>
      </header>

      <section className="py-20 text-center">
        <p className="mb-4 inline-block rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          Consumer + enterprise · powered by Convex & Clerk
        </p>
        <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-tight">
          Control every Hermes agent you run — from one place
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Deploy your agents anywhere, connect them here, and give them threads,
          tasks, skills, and integrations. Watch everything they do live — easier
          than a terminal or a messaging app.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <SignedOut>
            <SignUpButton mode="modal">
              <button className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:opacity-90">
                Start free
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:opacity-90"
            >
              Open dashboard
            </Link>
          </SignedIn>
        </div>
      </section>

      <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-surface p-6"
          >
            <f.icon className="mb-3 h-6 w-6 text-accent-2" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
