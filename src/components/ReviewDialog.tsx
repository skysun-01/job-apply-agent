"use client";

import { useState } from "react";
import type { MissingSkill, ReviewDecision, ReviewRequest } from "@/lib/agent/schemas";

const BADGE: Record<MissingSkill["importance"], string> = {
  critical: "bg-red-100 text-red-700",
  important: "bg-amber-100 text-amber-800",
  "nice-to-have": "bg-slate-100 text-slate-600",
};

/** The popup shown when the graph pauses at human_review. */
export function ReviewDialog({
  request,
  onSubmit,
}: {
  request: ReviewRequest;
  onSubmit: (decision: ReviewDecision) => void;
}) {
  const [choices, setChoices] = useState<Record<string, { approved: boolean; note: string }>>({});
  const choice = (skill: string) => choices[skill] ?? { approved: false, note: "" };
  const update = (skill: string, patch: Partial<{ approved: boolean; note: string }>) =>
    setChoices((current) => ({ ...current, [skill]: { ...choice(skill), ...patch } }));

  const approved = request.missingSkills
    .filter((s) => choice(s.skill).approved)
    .map((s) => ({ skill: s.skill, note: choice(s.skill).note.trim() }));

  const role = [request.job.title, request.job.company].filter(Boolean).join(" at ");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="border-b border-slate-100 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="review-title" className="text-lg font-semibold text-slate-900">
                {request.missingSkills.length > 0 ? "Skills you're missing" : "No major gaps found"}
              </h2>
              <p className="text-sm text-slate-500">{role}</p>
            </div>
            <Score value={request.matchScore} />
          </div>
          <p className="mt-3 text-sm text-slate-600">{request.verdict}</p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-6">
          {request.missingSkills.length === 0 ? (
            <p className="text-sm text-slate-600">
              Your resume already covers the main requirements. Continue and the agents will tailor your CV and draft the
              email.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Tick the skills you really have so the agent can add them to your CV. Saying how you used a skill lets it
                write a truthful bullet point instead of only listing it.
              </p>
              {request.missingSkills.map((s) => {
                const c = choice(s.skill);
                return (
                  <div
                    key={s.skill}
                    className={`rounded-xl border p-4 transition ${c.approved ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200"}`}
                  >
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={c.approved}
                        onChange={(e) => update(s.skill, { approved: e.target.checked })}
                        className="mt-1 h-4 w-4 accent-indigo-600"
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">{s.skill}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[s.importance]}`}>
                            {s.importance}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">{s.reason}</span>
                      </span>
                    </label>
                    {c.approved && (
                      <input
                        type="text"
                        maxLength={500}
                        value={c.note}
                        onChange={(e) => update(s.skill, { note: e.target.value })}
                        placeholder="Optional: how have you used it? e.g. “Set up CI/CD with it on my final-year project”"
                        className="input mt-3"
                      />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-end">
          {request.missingSkills.length > 0 && (
            <button type="button" className="btn-secondary" onClick={() => onSubmit({ approved: [] })}>
              Don&apos;t add any
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={request.missingSkills.length > 0 && approved.length === 0}
            onClick={() => onSubmit({ approved })}
          >
            {request.missingSkills.length === 0
              ? "Continue"
              : `Update CV with ${approved.length} skill${approved.length === 1 ? "" : "s"}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Score({ value }: { value: number }) {
  const color = value >= 75 ? "text-emerald-600" : value >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <div className="text-right">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}%</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">match</p>
    </div>
  );
}
