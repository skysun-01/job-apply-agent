import type { CandidateProfile, JobRequirements, SkillGap } from "@/lib/agent/schemas";

export type InsightData = { job?: JobRequirements; candidate?: CandidateProfile; gap?: SkillGap };

/** What the analysis agents found, shown as soon as each one finishes. */
export function Insights({ job, candidate, gap }: InsightData) {
  if (!job && !candidate && !gap) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {job && (
        <section className="card space-y-3">
          <h2 className="label">The job</h2>
          <div>
            <p className="font-semibold text-slate-900">{job.title}</p>
            <p className="text-sm text-slate-500">{[job.company, job.location, job.experienceLevel].filter(Boolean).join(" · ")}</p>
          </div>
          <Chips title="Required" items={job.requiredSkills} />
          <Chips title="Preferred" items={job.preferredSkills} muted />
          <p className="text-xs text-slate-500">
            Contact: {job.contactEmails.length > 0 ? job.contactEmails.join(", ") : "no email in the posting"}
          </p>
        </section>
      )}
      {candidate && (
        <section className="card space-y-3">
          <h2 className="label">You</h2>
          <div>
            <p className="font-semibold text-slate-900">{candidate.name}</p>
            <p className="text-sm text-slate-500">
              {[candidate.headline, candidate.yearsOfExperience].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Chips title="Skills on your CV" items={candidate.skills} />
        </section>
      )}
      {gap && (
        <section className="card space-y-3 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Skill gap</h2>
            <span className="text-sm font-semibold text-slate-700">{gap.matchScore}% match</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${gap.matchScore}%` }} />
          </div>
          <Chips title="You have" items={gap.matchedSkills} tone="good" />
          <Chips title="Missing" items={gap.missingSkills.map((s) => s.skill)} tone="bad" />
        </section>
      )}
    </div>
  );
}

const TONES = {
  default: "bg-slate-100 text-slate-700",
  muted: "bg-slate-50 text-slate-500 border border-slate-200",
  good: "bg-emerald-50 text-emerald-700",
  bad: "bg-red-50 text-red-700",
};

function Chips({
  title,
  items,
  muted,
  tone = muted ? "muted" : "default",
}: {
  title: string;
  items: string[];
  muted?: boolean;
  tone?: keyof typeof TONES;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className={`rounded-md px-2 py-0.5 text-xs ${TONES[tone]}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
