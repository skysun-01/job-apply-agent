import { runAgent } from "@/lib/agent/runner";
import { ResumeRequestSchema } from "@/lib/agent/schemas";
import { checkAccess, parseBody, streamEvents } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Phase 2: resume the paused run with the user's decision, update the CV and draft the email. */
export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;

  const body = await parseBody(request, ResumeRequestSchema);
  if ("error" in body) return body.error;

  return streamEvents(runAgent({ checkpoint: body.data.checkpoint, decision: body.data.decision }));
}
