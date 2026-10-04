"use client";

import { useState } from "react";
import type { EmailDraft, Resume } from "@/lib/agent/schemas";
import { ResumePreview } from "./ResumePreview";

export function Results({ resume, email }: { resume: Resume; email: EmailDraft }) {
  return (
    <div className="space-y-4">
      <EmailCard email={email} />
      <CvCard resume={resume} />
    </div>
  );
}

function EmailCard({ email }: { email: EmailDraft }) {
  const [to, setTo] = useState(email.to.join(", "));
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [copied, setCopied] = useState(false);

  const recipients = to
    .split(/[,;\s]+/)
    .filter(Boolean)
    .join(",");
  const mailto = `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  async function copy() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label">Email draft</h2>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <a className="btn-primary" href={mailto}>
            Open in mail app
          </a>
        </div>
      </div>
      <Field label="To">
        <input
          className="input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="No email found in the posting; add the recipient"
        />
      </Field>
      <Field label="Subject">
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Body">
        <textarea
          className="input min-h-72 resize-y leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <p className="text-xs text-slate-500">
        Mail apps can&apos;t receive attachments from a link, so attach the downloaded CV before sending.
      </p>
    </section>
  );
}

function CvCard({ resume }: { resume: Resume }) {
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setDownloading(true);
    setFailed(false);
    try {
      // The PDF renderer is large, so load it only when needed.
      const { downloadResumePdf } = await import("./resume-pdf");
      await downloadResumePdf(resume);
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label">Updated CV</h2>
        <button type="button" className="btn-primary" onClick={download} disabled={downloading}>
          {downloading ? "Building PDF…" : "Download PDF"}
        </button>
      </div>
      {failed && <p className="text-sm text-red-600">Couldn&apos;t build the PDF. Please try again.</p>}

      {resume.changes.length > 0 && (
        <details className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" open>
          <summary className="cursor-pointer font-medium">What changed ({resume.changes.length}), check before sending</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {resume.changes.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
        <ResumePreview resume={resume} />
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
