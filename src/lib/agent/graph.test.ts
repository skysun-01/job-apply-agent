import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { STEPS } from "../steps";
import { buildAgentGraph } from "./graph";
import type { Llm } from "./llm";
import { runAgent, type AgentEvent } from "./runner";
import type { CandidateProfile, JobRequirements, Resume, SkillGap } from "./schemas";

const JOB: JobRequirements = {
  title: "Backend Engineer",
  company: "Acme",
  location: "Remote",
  experienceLevel: "3+ years",
  summary: "Build Acme's APIs.",
  requiredSkills: ["Go", "PostgreSQL", "Kubernetes"],
  preferredSkills: ["Terraform"],
  responsibilities: ["Build services"],
  contactEmails: [],
  applicationInstructions: "",
};

const CANDIDATE: CandidateProfile = {
  name: "Jane Doe",
  email: "jane@example.com",
  phone: "",
  headline: "Software Engineer",
  yearsOfExperience: "5 years",
  skills: ["Go", "PostgreSQL"],
  highlights: ["Cut API latency by 40%"],
};

const GAP: SkillGap = {
  matchScore: 71.6,
  matchedSkills: ["Go", "PostgreSQL"],
  missingSkills: [
    { skill: "Terraform", importance: "nice-to-have", reason: "Listed as a plus." },
    { skill: "Kubernetes", importance: "critical", reason: "Services run on Kubernetes." },
  ],
  verdict: "Strong backend fit.",
};

const RESUME: Resume = {
  name: "Jane Doe",
  headline: "Software Engineer",
  contact: ["jane@example.com"],
  summary: "Backend engineer.",
  skills: [{ category: "Languages", items: ["Go"] }],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  otherSections: [],
  changes: ["Added Kubernetes"],
};

/** Fake model: canned answers per structured-output name, and it records every prompt. */
function fakeLlm() {
  const prompts: Record<string, string> = {};
  const answers: Record<string, unknown> = {
    job_requirements: JOB,
    candidate_profile: CANDIDATE,
    skill_gap: GAP,
    updated_resume: RESUME,
    application_email: { subject: "Application: Backend Engineer", body: "Hello" },
  };
  const llm: Llm = {
    async text() {
      return [
        "Backend Engineer at Acme (Remote)",
        "You will build and run the APIs behind our products.",
        "Requirements: Go, PostgreSQL, Kubernetes. Terraform is a plus.",
        "Send your CV to Jobs@Acme.example.",
      ].join("\n");
    },
    async json(_schema, name, _system, prompt) {
      prompts[name] = prompt;
      if (!(name in answers)) throw new Error(`Unexpected call: ${name}`);
      return structuredClone(answers[name]) as never;
    },
  };
  return { llm, prompts };
}

async function resumePdf(): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Jane Doe - Software Engineer",
    "jane@example.com",
    "Five years building backend services in Go and PostgreSQL.",
    "Acme Corp, Senior Engineer, 2021 - present: cut API latency by 40 percent.",
    "Globex, Engineer, 2019 - 2021: built billing pipelines and internal tooling.",
    "Skills: Go, PostgreSQL, Docker, gRPC, Redis, GitHub Actions.",
    "Education: BSc Computer Science, State University, 2019.",
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 760 - i * 18, size: 11, font }));
  return Buffer.from(await doc.save()).toString("base64");
}

async function collect(events: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const all: AgentEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
}

const stepsOf = (events: AgentEvent[]) => events.flatMap((e) => (e.type === "step" ? [e.node] : []));

describe("job apply agent graph", () => {
  it("has the nodes the UI lists", () => {
    const graph = buildAgentGraph({ llm: fakeLlm().llm });
    const nodes = Object.keys(graph.nodes).filter((n) => n !== "__start__");
    expect(nodes.sort()).toEqual(STEPS.map((s) => s.id).sort());
  });

  it("reads both documents in parallel, then pauses for review", async () => {
    const { llm } = fakeLlm();
    const events = await collect(
      runAgent(
        {
          input: {
            jobInput: { kind: "images", images: ["data:image/png;base64,iVBORw0KGgo="] },
            resumePdf: await resumePdf(),
          },
        },
        { llm },
      ),
    );

    const steps = stepsOf(events);
    // Both readers finish in the first step, before any agent runs.
    expect(steps.slice(0, 2).sort()).toEqual(["read_job", "read_resume"]);
    expect(steps.slice(2)).toEqual(["job_skills_agent", "resume_skills_agent", "skill_gap_agent"]);

    const last = events.at(-1)!;
    if (last.type !== "review") throw new Error(`Expected a review, got ${JSON.stringify(last)}`);
    expect(last.request.matchScore).toBe(72);
    expect(last.request.missingSkills.map((s) => s.skill)).toEqual(["Kubernetes", "Terraform"]);
    // Emails in the posting text are picked up even though the model returned none.
    expect(last.checkpoint.job.contactEmails).toEqual(["Jobs@Acme.example"]);
    // The resume came from the PDF text layer, not OCR.
    expect(last.checkpoint.resumeText).toContain("Five years building backend services");
    // The raw uploads are not sent back to the browser.
    expect(last.checkpoint).not.toHaveProperty("resumePdf");
    expect(last.checkpoint).not.toHaveProperty("jobInput");
  });

  it("resumes from the browser's copy of the state on a fresh graph", async () => {
    const first = fakeLlm();
    const paused = (
      await collect(
        runAgent({ input: { jobInput: { kind: "text", text: "x".repeat(60) + " hr@acme.example" }, resumePdf: await resumePdf() } }, { llm: first.llm }),
      )
    ).at(-1)!;
    if (paused.type !== "review") throw new Error("Expected a review");

    // Same round trip as the browser: JSON out, JSON back, new graph with an empty checkpointer.
    const checkpoint = JSON.parse(JSON.stringify(paused.checkpoint));
    const second = fakeLlm();
    const events = await collect(
      runAgent(
        { checkpoint, decision: { approved: [{ skill: "Kubernetes", note: "Ran a k3s cluster for my home lab" }] } },
        { llm: second.llm },
      ),
    );

    expect(stepsOf(events)).toEqual(["human_review", "cv_writer_agent", "email_agent"]);
    expect(second.prompts.updated_resume).toContain('Kubernetes (candidate\'s own words: "Ran a k3s cluster for my home lab")');

    const done = events.at(-1)!;
    if (done.type !== "done") throw new Error(`Expected done, got ${JSON.stringify(done)}`);
    expect(done.email).toEqual({ to: ["hr@acme.example"], subject: "Application: Backend Engineer", body: "Hello" });
    expect(done.resume.name).toBe("Jane Doe");
    expect(done.log.at(-3)).toBe("You approved adding: Kubernetes.");
  });
});
