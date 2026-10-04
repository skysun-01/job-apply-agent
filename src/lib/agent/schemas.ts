import * as z from "zod";

// ---------------------------------------------------------------------------
// Request bodies (validated in the API routes)
// ---------------------------------------------------------------------------

/** The job posting, as a link, one or more screenshots, or pasted text. */
export const JobInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().url() }),
  z.object({
    kind: z.literal("images"),
    images: z.array(z.string().startsWith("data:image/")).min(1).max(12),
  }),
  z.object({ kind: z.literal("text"), text: z.string().min(50, "Paste the full job description.") }),
]);
export type JobInput = z.infer<typeof JobInputSchema>;

export const AnalyzeRequestSchema = z.object({
  jobInput: JobInputSchema,
  /** The resume PDF, base64 encoded without a data: prefix. */
  resumePdf: z.string().min(100, "Upload your resume as a PDF."),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

/** What the user answers in the review popup. */
export const ReviewDecisionSchema = z.object({
  approved: z
    .array(
      z.object({
        skill: z.string().min(1),
        /** The user's own description of their experience with the skill, used to write truthful CV bullets. */
        note: z.string().max(500).default(""),
      }),
    )
    .max(30),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;
export type ApprovedSkill = ReviewDecision["approved"][number];

// ---------------------------------------------------------------------------
// Structured outputs of the agents. Every field is required (empty string / empty
// list when unknown) so the schemas work with OpenAI strict JSON mode as well as
// Anthropic tool calling.
// ---------------------------------------------------------------------------

export const JobRequirementsSchema = z.object({
  title: z.string().describe("Job title"),
  company: z.string().describe("Hiring company, or empty string if not stated"),
  location: z.string().describe("Location and remote policy, or empty string"),
  experienceLevel: z.string().describe("Seniority or years of experience asked for, or empty string"),
  summary: z.string().describe("Two-sentence summary of the role"),
  requiredSkills: z
    .array(z.string())
    .describe(
      "Must-have skills, tools, technologies, certifications and domain knowledge, as short canonical names such as 'React', 'AWS Lambda' or 'Stakeholder management'",
    ),
  preferredSkills: z
    .array(z.string())
    .describe("Skills the posting marks as preferred, a plus, a bonus or nice to have"),
  responsibilities: z.array(z.string()).describe("Main responsibilities, one short line each"),
  contactEmails: z
    .array(z.string())
    .describe("Every email address that appears in the posting, exactly as written"),
  applicationInstructions: z
    .string()
    .describe(
      "How to apply: subject line format, reference number, documents to attach. Empty string if the posting gives none",
    ),
});
export type JobRequirements = z.infer<typeof JobRequirementsSchema>;

export const CandidateProfileSchema = z.object({
  name: z.string().describe("Candidate's full name"),
  email: z.string().describe("Candidate's email, or empty string"),
  phone: z.string().describe("Candidate's phone number, or empty string"),
  headline: z.string().describe("Current job title or professional headline"),
  yearsOfExperience: z.string().describe("Total professional experience such as '4 years', or empty string"),
  skills: z
    .array(z.string())
    .describe(
      "Every skill the resume shows anywhere: skills section, job bullets, projects, certifications and education. Short canonical names",
    ),
  highlights: z
    .array(z.string())
    .describe("The candidate's 3 to 5 strongest achievements, one factual line each"),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const MissingSkillSchema = z.object({
  skill: z.string(),
  importance: z.enum(["critical", "important", "nice-to-have"]),
  reason: z.string().describe("One sentence on why this job needs the skill, citing the posting"),
});
export type MissingSkill = z.infer<typeof MissingSkillSchema>;

export const SkillGapSchema = z.object({
  matchScore: z.number().describe("Overall fit from 0 to 100"),
  matchedSkills: z.array(z.string()).describe("Skills the job asks for that the candidate clearly has"),
  missingSkills: z
    .array(MissingSkillSchema)
    .describe("Major skills the job asks for that the resume does not show, at most 10, most important first"),
  verdict: z.string().describe("Two or three sentences on overall fit and what the candidate should emphasise"),
});
export type SkillGap = z.infer<typeof SkillGapSchema>;

export const ResumeSchema = z.object({
  name: z.string(),
  headline: z.string(),
  contact: z
    .array(z.string())
    .describe("Contact items in the original order: email, phone, location, LinkedIn, GitHub, portfolio"),
  summary: z.string(),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  experience: z.array(
    z.object({
      role: z.string(),
      company: z.string(),
      location: z.string(),
      period: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(z.object({ name: z.string(), period: z.string(), bullets: z.array(z.string()) })),
  education: z.array(
    z.object({ degree: z.string(), institution: z.string(), period: z.string(), details: z.string() }),
  ),
  certifications: z.array(z.string()),
  otherSections: z
    .array(z.object({ title: z.string(), items: z.array(z.string()) }))
    .describe("Any other sections of the original resume, such as Awards, Languages or Publications"),
  changes: z
    .array(z.string())
    .describe("Every change made compared with the original resume, one short line each"),
});
export type Resume = z.infer<typeof ResumeSchema>;

export const EmailContentSchema = z.object({
  subject: z.string(),
  body: z.string().describe("Plain-text email body, from greeting to signature"),
});

export type EmailDraft = z.infer<typeof EmailContentSchema> & { to: string[] };

/** Payload of the human-in-the-loop interrupt: what the review popup shows. */
export type ReviewRequest = {
  job: { title: string; company: string };
  matchScore: number;
  verdict: string;
  matchedSkills: string[];
  missingSkills: MissingSkill[];
};

/**
 * Agent state as it travels through the browser between the two requests
 * (see runner.ts). The raw uploads are left out; later agents only need the text.
 */
export const CheckpointSchema = z.object({
  jobText: z.string(),
  resumeText: z.string(),
  job: JobRequirementsSchema,
  candidate: CandidateProfileSchema,
  gap: SkillGapSchema,
  log: z.array(z.string()),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const ResumeRequestSchema = z.object({
  checkpoint: CheckpointSchema,
  decision: ReviewDecisionSchema,
});
