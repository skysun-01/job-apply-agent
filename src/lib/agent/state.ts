import { Annotation } from "@langchain/langgraph";
import type {
  ApprovedSkill,
  CandidateProfile,
  EmailDraft,
  JobInput,
  JobRequirements,
  Resume,
  SkillGap,
} from "./schemas";

export const AgentState = Annotation.Root({
  // Inputs
  jobInput: Annotation<JobInput>,
  /** Resume PDF, base64. */
  resumePdf: Annotation<string>,

  // Step 1 (parallel): raw text of both documents
  jobText: Annotation<string>,
  resumeText: Annotation<string>,

  // Step 2 and 3: what each side has
  job: Annotation<JobRequirements>,
  candidate: Annotation<CandidateProfile>,

  // Step 4: comparison, then the user's decision
  gap: Annotation<SkillGap>,
  approvedSkills: Annotation<ApprovedSkill[]>,

  // Step 5 and 6: deliverables
  resume: Annotation<Resume>,
  email: Annotation<EmailDraft>,

  /**
   * What each agent did, for the activity feed. The two readers write to it in the
   * same step, so it needs a reducer to merge their entries instead of rejecting them.
   */
  log: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export type AgentValues = typeof AgentState.State;
export type AgentUpdate = typeof AgentState.Update;
