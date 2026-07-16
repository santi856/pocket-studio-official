// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

function toolUseResponse(
  input: unknown,
  name = "resolve_intent",
  usage: { input_tokens: number; output_tokens: number } = { input_tokens: 42, output_tokens: 17 },
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "tool_use", name, input }], usage }),
    text: async () => "",
  } as Response;
}

describe("AnthropicAIProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    setEnv({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key-123",
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a forced tool-use request and returns the parsed ResolvedIntent", async () => {
    const { AnthropicAIProvider } = await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      toolUseResponse({ type: "describe_idea", summary: "A booking app.", confidence: "high" }),
    );

    const result = await provider.resolveIntent({
      rawText: "Build a booking app.",
      hasExistingProductState: false,
    });

    expect(result).toEqual({
      type: "describe_idea",
      summary: "A booking app.",
      confidence: "high",
      usage: { inputTokens: 42, outputTokens: 17 },
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "test-key-123" });
    const body = JSON.parse(init.body as string);
    expect(body.tool_choice).toEqual({ type: "tool", name: "resolve_intent" });
    expect(body.messages).toEqual([{ role: "user", content: "Build a booking app." }]);
  });

  it("returns null usage when the response omits real token counts, never fabricating them", async () => {
    const { AnthropicAIProvider } = await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "tool_use",
            name: "resolve_intent",
            input: { type: "describe_idea", summary: "A booking app.", confidence: "high" },
          },
        ],
        // No `usage` field at all.
      }),
      text: async () => "",
    } as Response);

    const result = await provider.resolveIntent({
      rawText: "Build a booking app.",
      hasExistingProductState: false,
    });

    expect(result.usage).toBeNull();
  });

  it("throws AnthropicRequestError on a non-2xx response", async () => {
    const { AnthropicAIProvider, AnthropicRequestError } = await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "invalid x-api-key",
      json: async () => ({}),
    } as Response);

    await expect(
      provider.resolveIntent({ rawText: "Build a booking app.", hasExistingProductState: false }),
    ).rejects.toBeInstanceOf(AnthropicRequestError);
  });

  it("throws AnthropicRequestError when the network call itself fails", async () => {
    const { AnthropicAIProvider, AnthropicRequestError } = await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(
      provider.resolveIntent({ rawText: "Build a booking app.", hasExistingProductState: false }),
    ).rejects.toBeInstanceOf(AnthropicRequestError);
  });

  it("throws AnthropicResponseFormatError when no tool_use block is returned", async () => {
    const { AnthropicAIProvider, AnthropicResponseFormatError } =
      await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text" }] }),
      text: async () => "",
    } as Response);

    await expect(
      provider.resolveIntent({ rawText: "Build a booking app.", hasExistingProductState: false }),
    ).rejects.toBeInstanceOf(AnthropicResponseFormatError);
  });

  it("throws AnthropicResponseFormatError when the tool input does not match ResolvedIntent's shape", async () => {
    const { AnthropicAIProvider, AnthropicResponseFormatError } =
      await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      toolUseResponse({ type: "not_a_real_type", summary: "x", confidence: "high" }),
    );

    await expect(
      provider.resolveIntent({ rawText: "Build a booking app.", hasExistingProductState: false }),
    ).rejects.toBeInstanceOf(AnthropicResponseFormatError);
  });

  it("throws AnthropicRequestError immediately if no API key is configured, without making a network call", async () => {
    setEnv({
      AI_PROVIDER: "mock",
      ANTHROPIC_API_KEY: undefined,
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    const { AnthropicAIProvider, AnthropicRequestError } = await import("./anthropic-provider");
    const provider = new AnthropicAIProvider();
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

    await expect(
      provider.resolveIntent({ rawText: "Build a booking app.", hasExistingProductState: false }),
    ).rejects.toBeInstanceOf(AnthropicRequestError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // Round 2 independent review (post-D-0068) Finding R2-3: the fix for
  // round 1's Finding 2 (extractProductSemantics only fell back to the
  // deterministic extractor on a malformed-output failure, never on a
  // request/network failure) shipped with zero automated regression
  // coverage. These three tests close that gap.
  describe("extractProductSemantics", () => {
    const MINIMAL_VALID_EXTRACTION = {
      purpose: "A booking app.",
      targetUsers: [],
      actors: [],
      entities: [],
      workflows: [],
      capabilities: [],
      permissions: [],
      businessRules: [],
      monetization: [],
      integrations: [],
      constraints: [],
      unresolvedQuestions: [],
      consequentialDecisions: [],
      unsupportedRequirements: [],
    };

    it("returns the real extraction on a successful call, without falling back", async () => {
      const { AnthropicAIProvider } = await import("./anthropic-provider");
      const provider = new AnthropicAIProvider();
      const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce(
        toolUseResponse(MINIMAL_VALID_EXTRACTION, "extract_product_semantics"),
      );

      const result = await provider.extractProductSemantics({
        rawText: "Build a booking app.",
        priorRawText: null,
      });

      expect(result.purpose).toBe("A booking app.");
      // Real usage is the mode signal every caller relies on
      // (provider.ts's SemanticExtractionResult.usage doc comment) — a
      // successful real call must never return null usage.
      expect(result.usage).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to the deterministic extractor after exhausting retries on a request/network failure (round 2 Finding R2-3)", async () => {
      const { AnthropicAIProvider } = await import("./anthropic-provider");
      const provider = new AnthropicAIProvider();
      const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockRejectedValue(new Error("ECONNRESET"));

      const result = await provider.extractProductSemantics({
        rawText: "Managers can assign tasks to employees.",
        priorRawText: null,
      });

      // The deterministic fallback's own honest signal: never claims a
      // real provider call succeeded (provider.ts's usage doc comment).
      expect(result.usage).toBeNull();
      // Bounded retries, not infinite — the same MAX_ATTEMPTS budget
      // documented in the class itself.
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("falls back to the deterministic extractor after exhausting retries on a malformed-output failure", async () => {
      const { AnthropicAIProvider } = await import("./anthropic-provider");
      const provider = new AnthropicAIProvider();
      const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text" }] }),
        text: async () => "",
      } as Response);

      const result = await provider.extractProductSemantics({
        rawText: "Managers can assign tasks to employees.",
        priorRawText: null,
      });

      expect(result.usage).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
