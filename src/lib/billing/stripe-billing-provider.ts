import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import {
  BillingPortalNotAvailableError,
  BillingSubscriptionNotFoundOnProviderError,
  InvalidWebhookSignatureError,
} from "./provider";
import type {
  BillingProvider,
  ConstructWebhookEventInput,
  CreateBillingPortalSessionInput,
  WebhookEvent,
} from "./provider";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const REQUEST_TIMEOUT_MS = 30_000;
// Stripe's own documented default replay-attack tolerance.
const SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "StripeRequestError";
  }
}

function parseSignatureHeader(header: string): { timestamp: string; signatures: string[] } {
  const timestamps: string[] = [];
  const signatures: string[] = [];
  for (const pair of header.split(",")) {
    const [key, value] = pair.split("=", 2);
    if (key === "t" && value) timestamps.push(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamps.length !== 1 || signatures.length === 0) {
    throw new InvalidWebhookSignatureError();
  }
  return { timestamp: timestamps[0]!, signatures };
}

/**
 * Real server-side Stripe connection (Master Spec §61-§62, Phase 3).
 * Webhook signature verification implements Stripe's own publicly
 * documented scheme directly (HMAC-SHA256 over `${timestamp}.${rawBody}`,
 * constant-time comparison, a bounded replay-tolerance window) rather than
 * depending on the `stripe` SDK — the same "raw fetch/crypto over an SDK
 * dependency" choice made for AnthropicAIProvider (P3-01, D-0047), and one
 * that keeps this codebase's most security-critical billing code fully
 * auditable in-repo. Selected only when BILLING_PROVIDER=stripe and both
 * STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET are configured (src/lib/env.ts);
 * BILLING_PROVIDER=mock (the default) never constructs this class.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe" as const;

  constructWebhookEvent(input: ConstructWebhookEventInput): WebhookEvent {
    const env = getServerEnv();
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new InvalidWebhookSignatureError();
    }

    const { timestamp, signatures } = parseSignatureHeader(input.signatureHeader);

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) {
      throw new InvalidWebhookSignatureError();
    }
    const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
    if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
      throw new InvalidWebhookSignatureError();
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(`${timestamp}.${input.rawBody}`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    const isValid = signatures.some((signature) => {
      const signatureBuffer = Buffer.from(signature, "hex");
      return (
        signatureBuffer.length === expectedBuffer.length &&
        timingSafeEqual(signatureBuffer, expectedBuffer)
      );
    });
    if (!isValid) {
      throw new InvalidWebhookSignatureError();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch {
      throw new InvalidWebhookSignatureError();
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { id?: unknown }).id !== "string" ||
      typeof (parsed as { type?: unknown }).type !== "string"
    ) {
      throw new InvalidWebhookSignatureError();
    }
    const event = parsed as { id: string; type: string; data: unknown };
    return { id: event.id, type: event.type, data: event.data };
  }

  private async request(
    path: string,
    init: { method: "GET" | "POST"; body?: string },
  ): Promise<Response> {
    const env = getServerEnv();
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new BillingPortalNotAvailableError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(`${STRIPE_API_BASE}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: init.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new StripeRequestError(`Stripe API request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      }
      throw new StripeRequestError(
        `Stripe API request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async createBillingPortalSession(
    input: CreateBillingPortalSessionInput,
  ): Promise<{ url: string }> {
    const response = await this.request("/billing_portal/sessions", {
      method: "POST",
      body: new URLSearchParams({
        customer: input.customerId,
        return_url: input.returnUrl,
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new StripeRequestError(
        `Stripe API returned ${response.status}: ${body.slice(0, 500)}`,
        response.status,
      );
    }

    const data = (await response.json()) as { url: string };
    return { url: data.url };
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<{ status: string }> {
    const response = await this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "GET",
    });

    if (response.status === 404) {
      throw new BillingSubscriptionNotFoundOnProviderError();
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new StripeRequestError(
        `Stripe API returned ${response.status}: ${body.slice(0, 500)}`,
        response.status,
      );
    }

    const data = (await response.json()) as { status: string };
    return { status: data.status };
  }
}
