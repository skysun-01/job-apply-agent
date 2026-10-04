import type { Resume } from "@/lib/agent/schemas";

/** On-screen version of the CV. resume-pdf.tsx renders the same data as the downloadable PDF. */
export function ResumePreview({ resume }: { resume: Resume }) {
  return (
    <article className="space-y-5 text-sm leading-relaxed text-slate-800">
      <header className="space-y-1 text-center">
        <h3 className="text-2xl font-bold text-slate-900">{resume.name}</h3>
        {resume.headline && <p className="text-slate-600">{resume.headline}</p>}
        {resume.contact.length > 0 && <p className="text-xs text-slate-500">{resume.contact.join("  ·  ")}</p>}
      </header>

      {resume.summary && (
        <Section title="Summary">
          <p>{resume.summary}</p>
        </Section>
      )}

      {resume.skills.length > 0 && (
        <Section title="Skills">
          <ul className="space-y-0.5">
            {resume.skills.map((group) => (
              <li key={group.category}>
                <span className="font-semibold">{group.category}:</span> {group.items.join(", ")}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {resume.experience.length > 0 && (
        <Section title="Experience">
          {resume.experience.map((job, i) => (
            <Entry
              key={i}
              title={[job.role, job.company].filter(Boolean).join(", ")}
              meta={[job.location, job.period].filter(Boolean).join(" · ")}
              bullets={job.bullets}
            />
          ))}
        </Section>
      )}

      {resume.projects.length > 0 && (
        <Section title="Projects">
          {resume.projects.map((p, i) => (
            <Entry key={i} title={p.name} meta={p.period} bullets={p.bullets} />
          ))}
        </Section>
      )}

      {resume.education.length > 0 && (
        <Section title="Education">
          {resume.education.map((e, i) => (
            <Entry
              key={i}
              title={[e.degree, e.institution].filter(Boolean).join(", ")}
              meta={e.period}
              bullets={e.details ? [e.details] : []}
            />
          ))}
        </Section>
      )}

      {resume.certifications.length > 0 && (
        <Section title="Certifications">
          <ul className="list-disc pl-5">
            {resume.certifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Section>
      )}

      {resume.otherSections.map((s, i) => (
        <Section key={i} title={s.title}>
          <ul className="list-disc pl-5">
            {s.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </Section>
      ))}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-widest text-indigo-700">{title}</h4>
      {children}
    </section>
  );
}

function Entry({ title, meta, bullets }: { title: string; meta: string; bullets: string[] }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="font-semibold text-slate-900">{title}</p>
        {meta && <p className="text-xs text-slate-500">{meta}</p>}
      </div>
      {bullets.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
