/**
 * The graph's nodes in order, with the labels the UI shows. `after` mirrors the graph's
 * edges so the UI can tell which step is running. A test keeps this in sync with graph.ts.
 */
export const STEPS = [
  { id: "read_job", label: "Read job posting", detail: "Fetches the link or OCRs the screenshot", after: [] },
  { id: "read_resume", label: "Read resume", detail: "Extracts the PDF text (OCR if scanned)", after: [] },
  {
    id: "job_skills_agent",
    label: "Job requirements agent",
    detail: "Required skills and contact emails",
    after: ["read_job", "read_resume"],
  },
  { id: "resume_skills_agent", label: "Resume skills agent", detail: "Skills your CV shows", after: ["job_skills_agent"] },
  { id: "skill_gap_agent", label: "Skill gap agent", detail: "Major skills you're missing", after: ["resume_skills_agent"] },
  { id: "human_review", label: "Your approval", detail: "You choose what to add", after: ["skill_gap_agent"] },
  { id: "cv_writer_agent", label: "CV writer agent", detail: "Updates your CV", after: ["human_review"] },
  { id: "email_agent", label: "Email agent", detail: "Drafts the application email", after: ["cv_writer_agent"] },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
