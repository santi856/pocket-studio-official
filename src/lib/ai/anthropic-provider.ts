import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import type {
  AIProvider,
  ResolveIntentInput,
  ResolvedIntent,
  ResolvedIntentType,
} from "@/lib/ai/provider";

// Per current model guidance: default to the latest, most capable Claude
// model for real AI application traffic.
const MODEL_ID = "claude-sonnet-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 30_000;

export class AnthropicRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AnthropicRequestError";
  }
}

export class AnthropicResponseFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnthropicResponseFormatError";
  }
}

const RESOLVE_INTENT_TOOL_NAME = "resolve_intent";

const resolvedIntentSchema = z.object({
  type: z.enum(["describe_idea", "edit_request", "unclear"]),
  summary: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
});

function buildSystemPrompt(hasExistingProductState: boolean): string {
  return [
    "You classify a customer's message to a no-code product-building platform.",
    hasExistingProductState
      ? "This project already has an existing product. The customer's message is almost always an edit_request (a change to what already exists), unless it is too short or vague to act on (unclear)."
      : "This project has no product yet. The customer's message either describes a new product idea (describe_idea), or is too short or vague to act on (unclear).",
    "Never classify a clear, actionable message as unclear just because it is brief — only use unclear when the message genuinely does not contain enough information to act on.",
    `Call the ${RESOLVE_INTENT_TOOL_NAME} tool exactly once with your classification. "summary" is a faithful, concise restatement of what the customer asked for in your own words — never invent details the customer did not provide.`,
  ].join(" ");
}

const RESOLVE_INTENT_TOOL = {
  name: RESOLVE_INTENT_TOOL_NAME,
  description: "Record the classified intent of the customer's message.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: {
        type: "string" as const,
        enum: ["describe_idea", "edit_request", "unclear"] satisfies ResolvedIntentType[],
      },
      summary: { type: "string" as const },
      confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
    },
    required: ["type", "summary", "confidence"],
  },
};

type AnthropicToolUseBlock = {
  type: "tool_use";
  name: string;
  input: unknown;
};

type AnthropicContentBlock = AnthropicToolUseBlock | { type: string };

type AnthropicMessagesResponse = {
  content: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
};

/**
 * Real server-side Anthropic connection (Master Spec §61, Phase 3). Uses
 * forced tool use rather than free-text parsing so the response is
 * structurally guaranteed to match `ResolvedIntent`'s shape — never a
 * best-effort regex/JSON.parse over prose. Selected only when
 * AI_PROVIDER=anthropic and a real ANTHROPIC_API_KEY is configured
 * (src/lib/env.ts); AI_PROVIDER=mock (the default) never constructs this
 * class, so no real network call happens without an explicit, credentialed
 * opt-in.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly name = "anthropic" as const;

  async resolveIntent(input: ResolveIntentInput): Promise<ResolvedIntent> {
    const env = getServerEnv();
    // getServerEnv() already guarantees ANTHROPIC_API_KEY is present
    // whenever AI_PROVIDER=anthropic (fails fast at startup otherwise) —
    // this is a redundant runtime guard for any caller that constructs
    // this class directly rather than through getAIProvider().
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AnthropicRequestError(
        "ANTHROPIC_API_KEY is not configured. Set AI_PROVIDER=mock to run without a live provider.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify({
          model: MODEL_ID,
          max_tokens: 1024,
          system: buildSystemPrompt(input.hasExistingProductState),
          messages: [{ role: "user", content: input.rawText }],
          tools: [RESOLVE_INTENT_TOOL],
          tool_choice: { type: "tool", name: RESOLVE_INTENT_TOOL_NAME },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AnthropicRequestError(
          `Anthropic API request timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        );
      }
      throw new AnthropicRequestError(
        `Anthropic API request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AnthropicRequestError(
        `Anthropic API returned ${response.status}: ${body.slice(0, 500)}`,
        response.status,
      );
    }

    const data = (await response.json()) as AnthropicMessagesResponse;
    const toolUse = data.content.find(
      (block): block is AnthropicToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse || toolUse.name !== RESOLVE_INTENT_TOOL_NAME) {
      throw new AnthropicResponseFormatError(
        `Anthropic response did not include the expected "${RESOLVE_INTENT_TOOL_NAME}" tool call.`,
      );
    }

    const parsed = resolvedIntentSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new AnthropicResponseFormatError(
        `Anthropic's tool call input did not match the expected ResolvedIntent shape: ${parsed.error.message}`,
      );
    }

    const usage =
      typeof data.usage?.input_tokens === "number" && typeof data.usage?.output_tokens === "number"
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : null;

    return { ...parsed.data, usage };
  }
}
