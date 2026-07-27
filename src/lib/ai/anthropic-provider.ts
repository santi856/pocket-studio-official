import "server-only";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { deriveRequirementId } from "@/lib/orchestration/requirement-id";
import { extractSemanticsHeuristically } from "@/lib/ai/heuristic-extraction";
import type {
  AIProvider,
  ResolveIntentInput,
  ResolvedIntent,
  ResolvedIntentType,
  SemanticExtractionInput,
  SemanticExtractionResult,
  SemanticSourceType,
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

const EXTRACT_SEMANTICS_TOOL_NAME = "extract_product_semantics";

const SOURCE_TYPE_ENUM = [
  "customer_explicit",
  "customer_confirmed",
  "low_risk_inference",
  "recommendation",
  "unresolved",
  "consequential_decision",
  "system_constraint",
] satisfies SemanticSourceType[];

const provenanceRawSchema = z.object({
  sourceExcerpt: z.string().min(1).max(300),
  sourceType: z.enum(SOURCE_TYPE_ENUM),
  confidence: z.enum(["high", "medium", "low"]),
});

const semanticExtractionRawSchema = z.object({
  purpose: z.string().min(1),
  targetUsers: z.array(z.string()),
  actors: z.array(
    z
      .object({
        name: z.string().min(1),
        description: z.string(),
        goals: z.array(z.string()),
      })
      .and(provenanceRawSchema),
  ),
  entities: z.array(
    z
      .object({
        name: z.string().min(1),
        attributes: z.array(z.string()),
        relationships: z.array(z.string()),
        lifecycleStates: z.array(z.string()),
        ownerActor: z.string().nullable(),
      })
      .and(provenanceRawSchema),
  ),
  workflows: z.array(
    z
      .object({
        name: z.string().min(1),
        actor: z.string().nullable(),
        steps: z.array(z.string()),
        trigger: z.string().nullable(),
        recurrence: z.string().nullable(),
        hasDeadline: z.boolean(),
      })
      .and(provenanceRawSchema),
  ),
  capabilities: z.array(
    z
      .object({
        kind: z.enum([
          "action",
          "notification",
          "dashboard",
          "report",
          "search",
          "filter",
          "sort",
          "collaboration",
          "administration",
        ]),
        name: z.string().min(1),
        actor: z.string().nullable(),
        description: z.string(),
      })
      .and(provenanceRawSchema),
  ),
  permissions: z.array(
    z
      .object({
        actor: z.string().min(1),
        subject: z.string().min(1),
        access: z.enum(["full", "read_only", "none", "conditional"]),
        notes: z.string().nullable(),
      })
      .and(provenanceRawSchema),
  ),
  businessRules: z.array(z.object({ statement: z.string().min(1) }).and(provenanceRawSchema)),
  monetization: z.array(z.object({ statement: z.string().min(1) }).and(provenanceRawSchema)),
  integrations: z.array(z.object({ statement: z.string().min(1) }).and(provenanceRawSchema)),
  constraints: z.array(z.object({ statement: z.string().min(1) }).and(provenanceRawSchema)),
  unresolvedQuestions: z.array(z.string()),
  consequentialDecisions: z.array(z.string()),
  unsupportedRequirements: z.array(z.string()),
});

const provenanceProperties = {
  sourceExcerpt: { type: "string" as const },
  sourceType: { type: "string" as const, enum: SOURCE_TYPE_ENUM },
  confidence: { type: "string" as const, enum: ["high", "medium", "low"] },
};
const provenanceRequired = ["sourceExcerpt", "sourceType", "confidence"];

function buildSemanticSystemPrompt(hasPriorText: boolean): string {
  return [
    "You perform deep, domain-agnostic product understanding for a no-code product-building platform.",
    "Extract the customer's actual product meaning: purpose, target users, actors/roles, domain entities (with attributes, relationships, ownership, lifecycle states), workflows (steps, triggers, recurrence, deadlines), capabilities (actions, notifications, dashboards, reports, search/filter/sort, collaboration, administration), permissions, business rules, monetization facts, integrations, and constraints.",
    "Every material item MUST include sourceExcerpt (a short quote from the customer's actual text that grounds it), sourceType, and confidence. Use customer_explicit only when the customer's own words state it; customer_confirmed for something the customer previously confirmed; low_risk_inference for a conventional, low-risk inference (e.g. a booking flow implies a confirmation step); recommendation for something you are suggesting, not something stated; unresolved for something you cannot determine; consequential_decision for anything involving money, legal obligations, privacy, security, destructive actions, or irreversible external effects; system_constraint for a platform limitation, not a customer fact.",
    "Do not invent domain concepts the customer did not describe or reasonably imply. Do not silently decide a consequential question — record it in consequentialDecisions or unresolvedQuestions instead. If a requirement is clearly outside what this platform can support, record it in unsupportedRequirements rather than fabricating support.",
    hasPriorText
      ? "This is a follow-up edit to an existing product — extract the full resulting product meaning after applying the customer's requested change, not only the delta."
      : "This is a first-time product description.",
    `Call the ${EXTRACT_SEMANTICS_TOOL_NAME} tool exactly once with your complete structured extraction.`,
  ].join(" ");
}

const EXTRACT_SEMANTICS_TOOL = {
  name: EXTRACT_SEMANTICS_TOOL_NAME,
  description:
    "Record a complete, structured, provenance-tagged extraction of the product's meaning.",
  input_schema: {
    type: "object" as const,
    properties: {
      purpose: { type: "string" as const },
      targetUsers: { type: "array" as const, items: { type: "string" as const } },
      actors: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
            description: { type: "string" as const },
            goals: { type: "array" as const, items: { type: "string" as const } },
            ...provenanceProperties,
          },
          required: ["name", "description", "goals", ...provenanceRequired],
        },
      },
      entities: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
            attributes: { type: "array" as const, items: { type: "string" as const } },
            relationships: { type: "array" as const, items: { type: "string" as const } },
            lifecycleStates: { type: "array" as const, items: { type: "string" as const } },
            ownerActor: { type: ["string", "null"] as unknown as "string" },
            ...provenanceProperties,
          },
          required: [
            "name",
            "attributes",
            "relationships",
            "lifecycleStates",
            ...provenanceRequired,
          ],
        },
      },
      workflows: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
            actor: { type: ["string", "null"] as unknown as "string" },
            steps: { type: "array" as const, items: { type: "string" as const } },
            trigger: { type: ["string", "null"] as unknown as "string" },
            recurrence: { type: ["string", "null"] as unknown as "string" },
            hasDeadline: { type: "boolean" as const },
            ...provenanceProperties,
          },
          required: ["name", "steps", "hasDeadline", ...provenanceRequired],
        },
      },
      capabilities: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            kind: {
              type: "string" as const,
              enum: [
                "action",
                "notification",
                "dashboard",
                "report",
                "search",
                "filter",
                "sort",
                "collaboration",
                "administration",
              ],
            },
            name: { type: "string" as const },
            actor: { type: ["string", "null"] as unknown as "string" },
            description: { type: "string" as const },
            ...provenanceProperties,
          },
          required: ["kind", "name", "description", ...provenanceRequired],
        },
      },
      permissions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            actor: { type: "string" as const },
            subject: { type: "string" as const },
            access: { type: "string" as const, enum: ["full", "read_only", "none", "conditional"] },
            notes: { type: ["string", "null"] as unknown as "string" },
            ...provenanceProperties,
          },
          required: ["actor", "subject", "access", ...provenanceRequired],
        },
      },
      businessRules: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { statement: { type: "string" as const }, ...provenanceProperties },
          required: ["statement", ...provenanceRequired],
        },
      },
      monetization: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { statement: { type: "string" as const }, ...provenanceProperties },
          required: ["statement", ...provenanceRequired],
        },
      },
      integrations: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { statement: { type: "string" as const }, ...provenanceProperties },
          required: ["statement", ...provenanceRequired],
        },
      },
      constraints: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { statement: { type: "string" as const }, ...provenanceProperties },
          required: ["statement", ...provenanceRequired],
        },
      },
      unresolvedQuestions: { type: "array" as const, items: { type: "string" as const } },
      consequentialDecisions: { type: "array" as const, items: { type: "string" as const } },
      unsupportedRequirements: { type: "array" as const, items: { type: "string" as const } },
    },
    required: [
      "purpose",
      "targetUsers",
      "actors",
      "entities",
      "workflows",
      "capabilities",
      "permissions",
      "businessRules",
      "monetization",
      "integrations",
      "constraints",
      "unresolvedQuestions",
      "consequentialDecisions",
      "unsupportedRequirements",
    ],
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
type AnthropicToolCallResult<T> = {
  data: T;
  usage: { inputTokens: number; outputTokens: number } | null;
};

export class AnthropicAIProvider implements AIProvider {
  readonly name = "anthropic" as const;

  /**
   * Shared forced-tool-use call, extracted once a second real call site
   * (extractProductSemantics) needed the identical fetch/timeout/parse/
   * validate sequence resolveIntent already established — not a
   * speculative abstraction, both call sites are real.
   */
  private async callTool<T>(
    systemPrompt: string,
    userText: string,
    tool: { name: string; description: string; input_schema: unknown },
    schema: z.ZodType<T>,
    maxTokens: number,
  ): Promise<AnthropicToolCallResult<T>> {
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
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userText }],
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
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
    if (!toolUse || toolUse.name !== tool.name) {
      throw new AnthropicResponseFormatError(
        `Anthropic response did not include the expected "${tool.name}" tool call.`,
      );
    }

    const parsed = schema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new AnthropicResponseFormatError(
        `Anthropic's tool call input for "${tool.name}" did not match the expected shape: ${parsed.error.message}`,
      );
    }

    const usage =
      typeof data.usage?.input_tokens === "number" && typeof data.usage?.output_tokens === "number"
        ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
        : null;

    return { data: parsed.data, usage };
  }

  /**
   * Retries a bounded number of times on a request/response failure before
   * giving up (AI_MAX_RETRIES_PER_GENERATION, src/lib/env.ts) — this call
   * previously had no retry of its own at all (unlike
   * extractProductSemantics below), a real, confirmed gap (staging-
   * readiness sprint, 2026-07-26) that let a single transient timeout or
   * malformed response fail a customer's entire idea/edit submission.
   * Unlike extractProductSemantics, there is no deterministic fallback for
   * intent classification — after exhausting retries, the last error
   * propagates to the caller (studio-actions.ts already handles both
   * error types gracefully, preserving the customer's input).
   */
  async resolveIntent(input: ResolveIntentInput): Promise<ResolvedIntent> {
    const env = getServerEnv();
    const maxAttempts = 1 + env.AI_MAX_RETRIES_PER_GENERATION;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, usage } = await this.callTool(
          buildSystemPrompt(input.hasExistingProductState),
          input.rawText,
          RESOLVE_INTENT_TOOL,
          resolvedIntentSchema,
          env.AI_RESOLVE_INTENT_MAX_OUTPUT_TOKENS,
        );
        return { ...data, usage };
      } catch (error) {
        lastError = error;
        if (
          error instanceof AnthropicResponseFormatError ||
          error instanceof AnthropicRequestError
        ) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Real, forced-tool-use semantic extraction (D-0065, execution/
   * architecture/SEMANTIC_PRODUCT_COMPILER_REPORT.md §19 step 3). On a
   * validation/request failure after this call's own retry budget, falls
   * back to the honest deterministic heuristic extractor rather than
   * throwing the customer's whole request away — callers can distinguish
   * the two by generationMetadata.mode, which the caller (semantic-model.ts)
   * sets based on which path actually produced the result.
   */
  async extractProductSemantics(input: SemanticExtractionInput): Promise<SemanticExtractionResult> {
    const env = getServerEnv();
    const maxAttempts = 1 + env.AI_MAX_RETRIES_PER_GENERATION;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data, usage } = await this.callTool(
          buildSemanticSystemPrompt(input.priorRawText !== null),
          input.rawText,
          EXTRACT_SEMANTICS_TOOL,
          semanticExtractionRawSchema,
          env.AI_EXTRACT_SEMANTICS_MAX_OUTPUT_TOKENS,
        );

        const attach = (kind: string, name: string, raw: z.infer<typeof provenanceRawSchema>) => ({
          requirementId: deriveRequirementId(kind, name),
          sourceExcerpt: raw.sourceExcerpt,
          sourceType: raw.sourceType,
          confidence: raw.confidence,
        });

        return {
          purpose: data.purpose,
          targetUsers: data.targetUsers,
          actors: data.actors.map((a) => ({ ...a, provenance: attach("actor", a.name, a) })),
          entities: data.entities.map((e) => ({ ...e, provenance: attach("entity", e.name, e) })),
          workflows: data.workflows.map((w) => ({
            ...w,
            provenance: attach("workflow", w.name, w),
          })),
          capabilities: data.capabilities.map((c) => ({
            ...c,
            provenance: attach("capability", `${c.kind}-${c.name}`, c),
          })),
          permissions: data.permissions.map((p) => ({
            ...p,
            provenance: attach("permission", `${p.actor}-${p.subject}`, p),
          })),
          businessRules: data.businessRules.map((b) => ({
            statement: b.statement,
            provenance: attach("business_rule", b.statement, b),
          })),
          monetization: data.monetization.map((m) => ({
            statement: m.statement,
            provenance: attach("monetization", m.statement, m),
          })),
          integrations: data.integrations.map((i) => ({
            statement: i.statement,
            provenance: attach("integration", i.statement, i),
          })),
          constraints: data.constraints.map((c) => ({
            statement: c.statement,
            provenance: attach("constraint", c.statement, c),
          })),
          unresolvedQuestions: data.unresolvedQuestions,
          consequentialDecisions: data.consequentialDecisions,
          unsupportedRequirements: data.unsupportedRequirements,
          usage,
        };
      } catch (error) {
        lastError = error;
        // Independent Level 3 review (post-D-0067) Finding 2: this
        // previously only retried/fell back on a malformed-structured-
        // output failure (AnthropicResponseFormatError). A network
        // failure, timeout, or non-2xx response (AnthropicRequestError)
        // was re-thrown immediately, uncaught by any calling code —
        // directly contradicting this method's own doc comment and the
        // pre-implementation report's §14/§15 promise that a live-call
        // failure falls back to the deterministic extractor rather than
        // failing a customer's entire idea submission. Both known error
        // types now retry, then fall back, identically — an unexpected
        // error type outside either (a real programming bug, not a
        // request/response failure this method knows how to recover from)
        // still propagates immediately, on purpose.
        if (
          error instanceof AnthropicResponseFormatError ||
          error instanceof AnthropicRequestError
        ) {
          continue;
        }
        throw error;
      }
    }

    // Exhausted the retry budget — an honest, disclosed reduced-
    // intelligence fallback rather than surfacing a raw API error to the
    // customer for what the deterministic path can still meaningfully
    // attempt (Part 6: "if live AI is unavailable... identify the reduced
    // intelligence mode; show the limitation truthfully").
    void lastError;
    return extractSemanticsHeuristically(input.rawText);
  }
}
