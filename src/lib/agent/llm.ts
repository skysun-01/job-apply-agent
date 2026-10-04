import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type * as z from "zod";

/** Message parts the agents send: text, images (screenshots) and PDFs (scanned resumes). */
export type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | {
      type: "file";
      source_type: "base64";
      mime_type: string;
      data: string;
      metadata: { filename: string };
    };

/**
 * The two kinds of model call the agents make. Nodes depend on this interface rather
 * than on a LangChain model so tests can swap in a fake.
 */
export interface Llm {
  /** Free-text answer; used for OCR. */
  text(system: string, content: string | Part[]): Promise<string>;
  /** Answer parsed into `schema` (tool calling or JSON-schema mode, depending on the provider). */
  json<T extends z.ZodObject>(schema: T, name: string, system: string, prompt: string): Promise<z.infer<T>>;
}

type Provider = "openai" | "anthropic";

function resolveProvider(): Provider {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "anthropic") return explicit;
  if (explicit) throw new Error(`LLM_PROVIDER must be "openai" or "anthropic", not "${explicit}".`);
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  throw new Error("No model configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY (see .env.example).");
}

function createChatModel(): BaseChatModel {
  const provider = resolveProvider();
  const model = process.env.LLM_MODEL?.trim();

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: model || "claude-sonnet-5",
      // The rewritten CV comes back as one JSON object and can be long.
      maxTokens: 8192,
      maxRetries: 2,
    });
  }

  const name = model || "gpt-5-mini";
  return new ChatOpenAI({
    model: name,
    maxRetries: 2,
    // Set OPENAI_BASE_URL for Azure OpenAI (https://<resource>.openai.azure.com/openai/v1/)
    // or any other OpenAI-compatible endpoint. On Azure, LLM_MODEL is the deployment name.
    configuration: process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : undefined,
    // Reasoning models default to medium effort, which is slow for extraction work and
    // risks the serverless time limit. Low is plenty for these tasks.
    ...(/^(gpt-5|o\d)/.test(name) ? { reasoning: { effort: "low" as const } } : {}),
  });
}

export function createLlm(): Llm {
  const model = createChatModel();
  const messages = (system: string, content: string | Part[]) => [
    new SystemMessage(system),
    // LangChain converts these standard blocks to each provider's own format.
    new HumanMessage({ content: content as HumanMessage["content"] }),
  ];

  return {
    async text(system, content) {
      const reply = await model.invoke(messages(system, content));
      return reply.text.trim();
    },
    async json(schema, name, system, prompt) {
      const result = await model.withStructuredOutput(schema, { name }).invoke(messages(system, prompt));
      return result as z.infer<typeof schema>;
    },
  };
}
