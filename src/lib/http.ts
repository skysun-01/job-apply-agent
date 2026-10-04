import type * as z from "zod";
import type { AgentEvent } from "./agent/runner";

/**
 * Optional shared secret. A public Vercel URL would otherwise let anyone spend your
 * model credits; set ACCESS_CODE and the UI will ask for it once.
 */
export function checkAccess(request: Request): Response | undefined {
  const code = process.env.ACCESS_CODE;
  if (code && request.headers.get("x-access-code") !== code) {
    return Response.json({ error: "This deployment needs an access code." }, { status: 401 });
  }
  return undefined;
}

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const body = await request.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (result.success) return { data: result.data };
  const issue = result.error.issues[0];
  const message = issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request.";
  return { error: Response.json({ error: message }, { status: 400 }) };
}

/** Streams agent events as newline-delimited JSON, so the UI can show each step as it finishes. */
export function streamEvents(events: AsyncGenerator<AgentEvent>): Response {
  const encoder = new TextEncoder();
  const encode = (event: AgentEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encode(value));
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Something went wrong.";
        controller.enqueue(encode({ type: "error", message }));
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
