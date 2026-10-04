"use client";

import { useEffect, useState } from "react";
import { InputForm } from "@/components/InputForm";
import { Insights, type InsightData } from "@/components/Insights";
import { Pipeline, type Phase } from "@/components/Pipeline";
import { Results } from "@/components/Results";
import { ReviewDialog } from "@/components/ReviewDialog";
import type { AgentEvent } from "@/lib/agent/runner";
import type { AnalyzeRequest, ReviewDecision } from "@/lib/agent/schemas";
import { AccessCodeError, postJson, readNdjson } from "@/lib/client";
import type { StepId } from "@/lib/steps";

type ReviewEvent = Extract<AgentEvent, { type: "review" }>;
type DoneEvent = Extract<AgentEvent, { type: "done" }>;
type Retry = () => void;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [completed, setCompleted] = useState<StepId[]>([]);
  const [insights, setInsights] = useState<InsightData>({});
  const [log, setLog] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewEvent | null>(null);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState<{ message: string; retry?: Retry } | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);

  useEffect(() => {
    try {
      setAccessCode(localStorage.getItem("access-code") ?? "");
    } catch {
      // Storage can be unavailable (private mode); the code just won't be remembered.
    }
  }, []);

  /** Sends a request and applies the streamed agent events until the graph pauses or finishes. */
  async function run(path: string, body: unknown, running: Phase, retry: Retry) {
    setError(null);
    setPhase(running);
    try {
      const response = await postJson(path, body, accessCode);
      for await (const event of readNdjson<AgentEvent>(response)) {
        switch (event.type) {
          case "step": {
            const { update } = event;
            setCompleted((ids) => [...ids, event.node as StepId]);
            if (update.log) setLog((lines) => [...lines, ...update.log!]);
            if (update.job || update.candidate || update.gap) {
              setInsights((current) => ({
                job: update.job ?? current.job,
                candidate: update.candidate ?? current.candidate,
                gap: update.gap ?? current.gap,
              }));
            }
            break;
          }
          case "review":
            setReview(event);
            setPhase("review");
            return;
          case "done":
            setResult(event);
            setPhase("done");
            return;
          case "error":
            throw new Error(event.message);
        }
      }
      throw new Error("The agent stopped before finishing; the server may have timed out. Please try again.");
    } catch (err) {
      if (err instanceof AccessCodeError) setNeedsCode(true);
      setError({ message: err instanceof Error ? err.message : String(err), retry });
    }
  }

  function analyze(request: AnalyzeRequest) {
    setCompleted([]);
    setInsights({});
    setLog([]);
    setReview(null);
    setResult(null);
    void run("/api/analyze", request, "analyzing", () => analyze(request));
  }

  function decide(decision: ReviewDecision) {
    if (!review) return;
    const checkpoint = review.checkpoint;
    // Forget progress from a failed earlier attempt at this phase.
    setCompleted((ids) => ids.filter((id) => !["human_review", "cv_writer_agent", "email_agent"].includes(id)));
    void run("/api/resume", { checkpoint, decision }, "writing", () => decide(decision));
  }

  function saveCode(code: string) {
    setAccessCode(code);
    try {
      localStorage.setItem("access-code", code);
    } catch {
      // See above.
    }
  }

  const busy = phase === "review" || ((phase === "analyzing" || phase === "writing") && !error);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Job Apply Agent</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Give it a job posting and your resume. LangGraph agents find the skills you&apos;re missing, update your CV with
            the ones you approve and draft the application email.
          </p>
        </div>
        {needsCode && (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Access code</span>
            <input
              type="password"
              className="input w-48"
              value={accessCode}
              onChange={(e) => saveCode(e.target.value)}
            />
          </label>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6 lg:sticky lg:top-6">
          <InputForm busy={busy} onSubmit={analyze} />
          {phase !== "idle" && <Pipeline completed={completed} phase={phase} failed={error !== null} />}
        </div>

        <div className="min-w-0 space-y-6">
          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <span>{error.message}</span>
              {error.retry && (
                <button type="button" className="btn-secondary" onClick={error.retry}>
                  Try again
                </button>
              )}
            </div>
          )}

          {phase === "idle" && !error && <HowItWorks />}

          {result && <Results resume={result.resume} email={result.email} />}

          <Insights {...insights} />

          {log.length > 0 && (
            <section className="card">
              <h2 className="label mb-2">Activity</h2>
              <ol className="space-y-1 text-sm text-slate-600">
                {log.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-300">{String(i + 1).padStart(2, "0")}</span>
                    {line}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {phase === "review" && review && <ReviewDialog request={review.request} onSubmit={decide} />}
    </main>
  );
}

function HowItWorks() {
  const steps = [
    ["Read", "The job posting (link, screenshot OCR or text) and your resume PDF are read at the same time."],
    ["Extract", "One agent lists the job's required skills and contact emails; another lists the skills on your CV."],
    ["Compare", "A third agent finds the major skills you're missing and asks you which ones you really have."],
    ["Write", "Your CV is updated with the skills you approved, and an email to the recruiter is drafted."],
  ];
  return (
    <section className="card">
      <h2 className="label mb-4">How it works</h2>
      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map(([title, text], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
              {i + 1}
            </span>
            <div>
              <p className="font-medium text-slate-900">{title}</p>
              <p className="text-sm text-slate-500">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
