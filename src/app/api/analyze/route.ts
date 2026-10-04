import { runAgent } from "@/lib/agent/runner";
import { AnalyzeRequestSchema } from "@/lib/agent/schemas";
import { checkAccess, parseBody, streamEvents } from "@/lib/http";

export const runtime = "nodejs";
// Model calls are slow; allow up to 5 minutes (the Vercel Hobby maximum with Fluid compute).
export const maxDuration = 300;

/** Phase 1: read both documents in parallel, extract skills, compare, then pause for review. */
export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;

  const body = await parseBody(request, AnalyzeRequestSchema);
  if ("error" in body) return body.error;

  return streamEvents(runAgent({ input: body.data }));
}
