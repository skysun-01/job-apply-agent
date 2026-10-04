import { interrupt } from "@langchain/langgraph";
import type { Llm, Part } from "./llm";
import { extractPdfText, fetchJobPage, findEmails, uniqueEmails } from "./readers";
import {
  CandidateProfileSchema,
  EmailContentSchema,
  JobRequirementsSchema,
  ResumeSchema,
  ReviewDecisionSchema,
  SkillGapSchema,
  type ReviewRequest,
} from "./schemas";
import type { AgentUpdate, AgentValues } from "./state";

type Node = (state: AgentValues) => Promise<AgentUpdate>;

const list = (items: string[]) => (items.length > 0 ? items.join(", ") : "(none)");
const quoted = (label: string, text: string) => `${label}:\n"""\n${text}\n"""`;

const OCR_SYSTEM = `You are an OCR engine. Transcribe every piece of text in what you are given exactly as written, including headings, bullet points, links, phone numbers and email addresses. Keep the reading order and line breaks. Do not summarise, translate, correct or comment. Output only the transcription.`;

// ---------------------------------------------------------------------------
// Step 1: data fetching. These two run in parallel.
// ---------------------------------------------------------------------------

export function readJob(llm: Llm): Node {
  return async ({ jobInput }) => {
    switch (jobInput.kind) {
      case "url": {
        const { text, source } = await fetchJobPage(jobInput.url);
        return { jobText: text, log: [`Read the job posting at ${new URL(jobInput.url).hostname} (${source}).`] };
      }
      case "images": {
        const count = jobInput.images.length;
        const instruction =
          count === 1
            ? "Transcribe this job posting."
            : `These ${count} images are consecutive parts of one job posting; neighbouring images may overlap. Transcribe them as one document without repeating overlapping lines.`;
        const parts: Part[] = [
          { type: "text", text: instruction },
          ...jobInput.images.map((url): Part => ({ type: "image_url", image_url: { url } })),
        ];
        const text = await llm.text(OCR_SYSTEM, parts);
        if (text.length < 100) throw new Error("Couldn't read a job description in the screenshot. Try a sharper image.");
        return { jobText: text, log: [`OCR read ${text.length.toLocaleString()} characters from ${count} image(s).`] };
      }
      case "text":
        return { jobText: jobInput.text.trim(), log: ["Used the pasted job description."] };
    }
  };
}

export function readResume(llm: Llm): Node {
  return async ({ resumePdf }) => {
    const text = await extractPdfText(resumePdf);
    if (text.replace(/\s/g, "").length >= 200) {
      return { resumeText: text, log: [`Extracted ${text.length.toLocaleString()} characters of text from the resume PDF.`] };
    }

    // Scanned or image-only PDF: there is no text layer, so OCR it with the vision model.
    const ocr = await llm.text(OCR_SYSTEM, [
      { type: "text", text: "Transcribe this resume." },
      {
        type: "file",
        source_type: "base64",
        mime_type: "application/pdf",
        data: resumePdf,
        metadata: { filename: "resume.pdf" },
      },
    ]);
    if (ocr.length < 100) throw new Error("Couldn't read any text in the resume PDF.");
    return { resumeText: ocr, log: ["The resume PDF has no text layer, so it was read with OCR."] };
  };
}

// ---------------------------------------------------------------------------
// Step 2: job requirements agent
// ---------------------------------------------------------------------------

const JOB_SYSTEM = `You are an experienced technical recruiter. Extract the hiring requirements from a job posting.
The text may contain website navigation, cookie banners or OCR noise; ignore anything that isn't part of the posting.
Only list requirements the posting actually states. Use short, canonical skill names.`;

export function jobSkillsAgent(llm: Llm): Node {
  return async ({ jobText }) => {
    const job = await llm.json(JobRequirementsSchema, "job_requirements", JOB_SYSTEM, quoted("Job posting", jobText));
    // The model can miss or mangle addresses, so also take every address literally present in the text.
    const contactEmails = uniqueEmails([...findEmails(jobText), ...job.contactEmails]);
    return {
      job: { ...job, contactEmails },
      log: [
        `Job requirements agent: "${job.title}" needs ${job.requiredSkills.length} skills (+${job.preferredSkills.length} preferred)` +
          (contactEmails.length > 0 ? `, contact: ${contactEmails.join(", ")}.` : "; no contact email in the posting."),
      ],
    };
  };
}

// ---------------------------------------------------------------------------
// Step 3: resume skills agent
// ---------------------------------------------------------------------------

const RESUME_SYSTEM = `You are an experienced technical recruiter. Build a profile of the candidate from their resume.
Collect every skill the resume demonstrates, including ones that only appear inside job or project descriptions.
Report only what the resume says; do not guess.`;

export function resumeSkillsAgent(llm: Llm): Node {
  return async ({ resumeText }) => {
    const candidate = await llm.json(CandidateProfileSchema, "candidate_profile", RESUME_SYSTEM, quoted("Resume", resumeText));
    return { candidate, log: [`Resume skills agent: found ${candidate.skills.length} skills in your resume.`] };
  };
}

// ---------------------------------------------------------------------------
// Step 4: skill gap agent, then the human review
// ---------------------------------------------------------------------------

const GAP_SYSTEM = `You compare a candidate with a job's requirements.
A skill counts as matched when the resume shows it directly, under another name or spelling (React / React.js, Postgres / PostgreSQL), or through a more specific skill that implies it (PostgreSQL implies SQL, AWS Lambda implies AWS).
Report only major missing skills, the ones a hiring manager would screen for, at most 10.
Importance: "critical" = required and central to the role; "important" = required but secondary; "nice-to-have" = only preferred.`;

const IMPORTANCE_ORDER = { critical: 0, important: 1, "nice-to-have": 2 } as const;

export function skillGapAgent(llm: Llm): Node {
  return async ({ job, candidate, resumeText }) => {
    const prompt = [
      `Job: ${job.title}${job.company ? ` at ${job.company}` : ""}`,
      `Required skills: ${list(job.requiredSkills)}`,
      `Preferred skills: ${list(job.preferredSkills)}`,
      `Responsibilities:\n- ${job.responsibilities.join("\n- ")}`,
      `Candidate skills: ${list(candidate.skills)}`,
      quoted("Full resume, to catch skills the list above missed", resumeText),
    ].join("\n\n");

    const gap = await llm.json(SkillGapSchema, "skill_gap", GAP_SYSTEM, prompt);
    const missingSkills = [...gap.missingSkills].sort(
      (a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance],
    );
    const matchScore = Math.min(100, Math.max(0, Math.round(gap.matchScore)));
    return {
      gap: { ...gap, matchScore, missingSkills },
      log: [`Skill gap agent: ${matchScore}% match, ${missingSkills.length} major skill(s) missing.`],
    };
  };
}

/** Pauses the graph and shows the user the gaps. Resumes with the skills they approved. */
export const humanReview: Node = async ({ job, gap }) => {
  const request: ReviewRequest = {
    job: { title: job.title, company: job.company },
    matchScore: gap.matchScore,
    verdict: gap.verdict,
    matchedSkills: gap.matchedSkills,
    missingSkills: gap.missingSkills,
  };
  // interrupt() stops the run here the first time. When the run is resumed with
  // Command({ resume }), the node runs again and interrupt() returns that value.
  const decision = ReviewDecisionSchema.parse(interrupt(request));
  const names = decision.approved.map((s) => s.skill);
  return {
    approvedSkills: decision.approved,
    log: [names.length > 0 ? `You approved adding: ${names.join(", ")}.` : "You chose not to add any skills."],
  };
};

// ---------------------------------------------------------------------------
// Step 5: CV writer agent
// ---------------------------------------------------------------------------

const CV_SYSTEM = `You are an expert resume writer. Update the candidate's resume for the target job.
Rules:
- Keep every employer, job title, date, degree, institution and number exactly as in the original. Never invent experience, employers, metrics or credentials.
- Keep every section and entry of the original. You may tighten wording and reorder bullets and skills so the most relevant come first.
- Add each confirmed skill to the skills section. If the candidate described how they used it, also work that into the most fitting experience or project bullet, staying faithful to their description. Without a description, add it to the skills section only.
- Where the candidate already has a skill under another name, use the job posting's name for it.
- Write a two or three sentence summary aimed at this role, using only facts from the resume.
- Use empty strings or empty lists for anything the resume doesn't have.
- List every change you made in "changes" so the candidate can check it.`;

export function cvWriterAgent(llm: Llm): Node {
  return async ({ job, approvedSkills, resumeText }) => {
    const confirmed =
      approvedSkills.length > 0
        ? approvedSkills
            .map((s) => `- ${s.skill}${s.note ? ` (candidate's own words: "${s.note}")` : ""}`)
            .join("\n")
        : "(none: the candidate chose not to add skills, so only tailor the existing content)";

    const prompt = [
      `Target job: ${job.title}${job.company ? ` at ${job.company}` : ""}`,
      `Required skills: ${list(job.requiredSkills)}`,
      `Preferred skills: ${list(job.preferredSkills)}`,
      `Skills the candidate confirmed they have and wants added:\n${confirmed}`,
      quoted("Original resume", resumeText),
    ].join("\n\n");

    const resume = await llm.json(ResumeSchema, "updated_resume", CV_SYSTEM, prompt);
    return { resume, log: [`CV writer agent: updated your CV (${resume.changes.length} changes).`] };
  };
}

// ---------------------------------------------------------------------------
// Step 6: email agent
// ---------------------------------------------------------------------------

const EMAIL_SYSTEM = `You write short, specific job application emails.
- 120 to 200 words, plain text, no markdown.
- Greet the hiring team, or the person the posting names.
- Say which role you are applying for and give two or three concrete reasons you fit, taken from the resume.
- Mention that the updated CV is attached.
- Follow any application instructions in the posting, such as a subject line format or reference number.
- Close politely with the candidate's name, phone and email.
- Never use placeholders in brackets; leave out anything unknown.`;

export function emailAgent(llm: Llm): Node {
  return async ({ job, candidate, gap, resume }) => {
    const prompt = [
      `Role: ${job.title}${job.company ? ` at ${job.company}` : ""}`,
      `Role summary: ${job.summary}`,
      `Application instructions: ${job.applicationInstructions || "(none)"}`,
      `Skills the candidate matches: ${list(gap.matchedSkills)}`,
      `Candidate: ${resume.name || candidate.name}, ${candidate.headline}; ${candidate.yearsOfExperience || "experience not stated"}`,
      `Candidate contact: ${[candidate.email, candidate.phone].filter(Boolean).join(", ") || "(none)"}`,
      `CV summary: ${resume.summary}`,
      `Highlights:\n- ${candidate.highlights.join("\n- ")}`,
    ].join("\n\n");

    const content = await llm.json(EmailContentSchema, "application_email", EMAIL_SYSTEM, prompt);
    const to = job.contactEmails;
    return {
      email: { to, ...content },
      log: [
        to.length > 0
          ? `Email agent: drafted the email to ${to.join(", ")}.`
          : "Email agent: drafted the email. The posting had no email address, so add the recipient yourself.",
      ],
    };
  };
}
