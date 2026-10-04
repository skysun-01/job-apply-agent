import { STEPS, type StepId } from "@/lib/steps";

export type Phase = "idle" | "analyzing" | "review" | "writing" | "done";
type Status = "done" | "running" | "waiting" | "pending";

function statusOf(step: (typeof STEPS)[number], completed: StepId[], phase: Phase, failed: boolean): Status {
  if (completed.includes(step.id)) return "done";
  if (step.id === "human_review" && phase === "review") return "waiting";
  const active = !failed && (phase === "analyzing" || phase === "writing");
  if (active && step.after.every((id) => completed.includes(id))) return "running";
  return "pending";
}

const ICON: Record<Status, string> = { done: "✓", running: "", waiting: "!", pending: "" };
const DOT: Record<Status, string> = {
  done: "bg-emerald-500 text-white",
  running: "border-2 border-indigo-500 border-t-transparent animate-spin",
  waiting: "bg-amber-400 text-white",
  pending: "border-2 border-slate-200",
};

export function Pipeline({ completed, phase, failed }: { completed: StepId[]; phase: Phase; failed: boolean }) {
  const [readJob, readResume, ...rest] = STEPS;

  const row = (step: (typeof STEPS)[number]) => {
    const status = statusOf(step, completed, phase, failed);
    return (
      <div key={step.id} className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${DOT[status]}`}>
          {ICON[status]}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${status === "pending" ? "text-slate-400" : "text-slate-800"}`}>{step.label}</p>
          <p className="text-xs text-slate-500">{step.detail}</p>
        </div>
      </div>
    );
  };

  return (
    <section className="card space-y-4" aria-label="Agent progress">
      <h2 className="label">Agent pipeline</h2>
      <div className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Runs in parallel</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {row(readJob)}
          {row(readResume)}
        </div>
      </div>
      <div className="space-y-3 pl-3">{rest.map(row)}</div>
    </section>
  );
}
