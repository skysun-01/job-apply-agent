"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fileToBase64, prepareScreenshot } from "@/lib/client";
import type { AnalyzeRequest, JobInput } from "@/lib/agent/schemas";

type Mode = JobInput["kind"];

const MODES: { id: Mode; label: string }[] = [
  { id: "url", label: "Link" },
  { id: "images", label: "Screenshot" },
  { id: "text", label: "Paste text" },
];

export function InputForm({ busy, onSubmit }: { busy: boolean; onSubmit: (request: AnalyzeRequest) => void }) {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [shots, setShots] = useState<File[]>([]);
  const [resume, setResume] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Screenshots can be pasted straight from the clipboard.
  useEffect(() => {
    if (mode !== "images") return;
    const onPaste = (event: ClipboardEvent) => {
      const images = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (images.length > 0) setShots((current) => [...current, ...images]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    if (!resume) return setProblem("Upload your resume as a PDF.");
    if (resume.size > 3 * 1024 * 1024) return setProblem("The resume PDF must be 3 MB or smaller.");

    setPreparing(true);
    try {
      let jobInput: JobInput;
      if (mode === "url") jobInput = { kind: "url", url: url.trim() };
      else if (mode === "text") jobInput = { kind: "text", text };
      else {
        if (shots.length === 0) return setProblem("Add at least one screenshot of the job posting.");
        const images = (await Promise.all(shots.map(prepareScreenshot))).flat();
        if (images.length > 12) return setProblem("That's too much image to read at once; use fewer or shorter screenshots.");
        jobInput = { kind: "images", images };
      }
      onSubmit({ jobInput, resumePdf: await fileToBase64(resume) });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't read the files.");
    } finally {
      setPreparing(false);
    }
  }

  const disabled = busy || preparing;

  return (
    <form onSubmit={submit} className="card space-y-5">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="label">1. Job posting</legend>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === m.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "url" && (
          <input
            type="url"
            required
            placeholder="https://company.com/careers/job-123"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input"
          />
        )}

        {mode === "text" && (
          <textarea
            required
            rows={8}
            placeholder="Paste the full job description, including any contact email…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input resize-y"
          />
        )}

        {mode === "images" && (
          <div className="space-y-2">
            <label className="dropzone">
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  setShots((current) => [...current, ...files]);
                  e.target.value = "";
                }}
              />
              <span className="font-medium text-slate-700">Choose screenshots</span>
              <span className="text-xs text-slate-500">or press Ctrl+V to paste one</span>
            </label>
            {shots.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {shots.map((file, i) => (
                  <Thumbnail
                    key={`${file.name}-${i}`}
                    file={file}
                    onRemove={() => setShots((current) => current.filter((_, j) => j !== i))}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </fieldset>

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="label">2. Your resume</legend>
        <label className="dropzone">
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => setResume(e.target.files?.[0] ?? null)}
          />
          <span className="font-medium text-slate-700">{resume ? resume.name : "Choose a PDF"}</span>
          <span className="text-xs text-slate-500">
            {resume ? `${(resume.size / 1024).toFixed(0)} KB` : "Text or scanned PDF, up to 3 MB"}
          </span>
        </label>
      </fieldset>

      {problem && <p className="text-sm text-red-600">{problem}</p>}

      <button type="submit" disabled={disabled} className="btn-primary w-full">
        {preparing ? "Preparing files…" : busy ? "Agents working…" : "Analyse my fit"}
      </button>
    </form>
  );
}

function Thumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <li className="relative h-20 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
      {src && <img src={src} alt={file.name} className="h-full w-full object-cover object-top" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-xs text-white hover:bg-slate-900"
      >
        ×
      </button>
    </li>
  );
}
