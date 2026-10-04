import { END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { createLlm, type Llm } from "./llm";
import {
  cvWriterAgent,
  emailAgent,
  humanReview,
  jobSkillsAgent,
  readJob,
  readResume,
  resumeSkillsAgent,
  skillGapAgent,
} from "./nodes";
import { AgentState } from "./state";

/**
 *            ┌─> read_job ────┐
 *   START ───┤                ├─> job_skills_agent ─> resume_skills_agent ─> skill_gap_agent
 *            └─> read_resume ─┘
 *
 *   ─> human_review (interrupt) ─> cv_writer_agent ─> email_agent ─> END
 *
 * Both readers start from START, so LangGraph runs them in the same step, concurrently.
 * The array edge makes job_skills_agent wait for both. Everything after that is sequential.
 */
export function buildAgentGraph({ llm = createLlm() }: { llm?: Llm } = {}) {
  return new StateGraph(AgentState)
    .addNode("read_job", readJob(llm))
    .addNode("read_resume", readResume(llm))
    .addNode("job_skills_agent", jobSkillsAgent(llm))
    .addNode("resume_skills_agent", resumeSkillsAgent(llm))
    .addNode("skill_gap_agent", skillGapAgent(llm))
    .addNode("human_review", humanReview)
    .addNode("cv_writer_agent", cvWriterAgent(llm))
    .addNode("email_agent", emailAgent(llm))
    .addEdge(START, "read_job")
    .addEdge(START, "read_resume")
    .addEdge(["read_job", "read_resume"], "job_skills_agent")
    .addEdge("job_skills_agent", "resume_skills_agent")
    .addEdge("resume_skills_agent", "skill_gap_agent")
    .addEdge("skill_gap_agent", "human_review")
    .addEdge("human_review", "cv_writer_agent")
    .addEdge("cv_writer_agent", "email_agent")
    .addEdge("email_agent", END)
    // interrupt() needs a checkpointer. Memory is enough: runner.ts explains why nothing
    // has to outlive the request.
    .compile({ checkpointer: new MemorySaver() });
}
