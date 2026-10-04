import { Command } from "@langchain/langgraph";
import { buildAgentGraph } from "./graph";
import type { Llm } from "./llm";
import type {
  AnalyzeRequest,
  Checkpoint,
  EmailDraft,
  Resume,
  ReviewDecision,
  ReviewRequest,
} from "./schemas";
import type { AgentValues } from "./state";

/** What the API streams to the browser, one JSON object per line. */
export type AgentEvent =
  | { type: "step"; node: string; update: Partial<AgentValues> }
  | { type: "review"; request: ReviewRequest; checkpoint: Checkpoint }
  | { type: "done"; resume: Resume; email: EmailDraft; log: string[] }
  | { type: "error"; message: string };

export type RunStart =
  | { input: AnalyzeRequest }
  | { checkpoint: Checkpoint; decision: ReviewDecision };

/**
 * Runs the graph until it pauses for review (first request) or finishes (second request).
 *
 * Vercel functions don't share memory between requests, and the user may take minutes
 * to answer the popup, so an in-memory checkpoint can't be relied on to still exist
 * when they do. Instead the paused state goes to the browser with the review request
 * and comes back with the decision. Each request uses a fresh thread: the second one
 * re-seeds it as if skill_gap_agent had just finished, which puts human_review next,
 * then resumes with Command({ resume }) so interrupt() returns the decision.
 */
export async function* runAgent(start: RunStart, deps: { llm?: Llm } = {}): AsyncGenerator<AgentEvent> {
  const graph = buildAgentGraph(deps);
  const config = { configurable: { thread_id: crypto.randomUUID() } };

  type GraphInput = Parameters<typeof graph.stream>[0];
  let input: GraphInput;
  if ("input" in start) {
    input = start.input;
  } else {
    await graph.updateState(config, start.checkpoint, "skill_gap_agent");
    input = new Command({ resume: start.decision }) as GraphInput;
  }

  const stream = await graph.stream(input, { ...config, streamMode: "updates" });
  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(chunk as Record<string, Partial<AgentValues>>)) {
      if (node !== "__interrupt__") yield { type: "step", node, update };
    }
  }

  const snapshot = await graph.getState(config);
  const values = snapshot.values as AgentValues;
  const pending = snapshot.tasks.flatMap((task) => task.interrupts);
  if (pending.length > 0) {
    const { jobText, resumeText, job, candidate, gap, log } = values;
    yield {
      type: "review",
      request: pending[0].value as ReviewRequest,
      checkpoint: { jobText, resumeText, job, candidate, gap, log },
    };
    return;
  }

  yield { type: "done", resume: values.resume, email: values.email, log: values.log };
}
