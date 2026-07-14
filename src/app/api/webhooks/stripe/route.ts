import { NextResponse } from "next/server";
import {
  processBillingWebhook,
  UnrecognizedWebhookOrganizationError,
} from "@/lib/billing/webhook-processing";
import { InvalidWebhookSignatureError } from "@/lib/billing/provider";

/**
 * Master Spec §37/§61's verified-webhooks requirement. No platform
 * session check — a webhook has no Pocket Studio user actor, the request
 * is authenticated entirely by its cryptographic signature
 * (processBillingWebhook -> the active BillingProvider's
 * constructWebhookEvent). The raw body must be read as text, not parsed
 * as JSON, since signature verification is over the exact bytes Stripe
 * signed — re-serializing a parsed object would not reproduce them.
 */
export async function POST(request: Request) {
  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return new NextResponse("Missing Stripe-Signature header.", { status: 400 });
  }

  const rawBody = await request.text();

  try {
    const result = await processBillingWebhook(rawBody, signatureHeader);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return new NextResponse(error.message, { status: 400 });
    }
    if (error instanceof UnrecognizedWebhookOrganizationError) {
      // A 200 here, not an error status, is deliberate: Stripe retries
      // non-2xx responses on a backoff schedule, and an event for an
      // unlinked customer will never resolve on retry — acknowledging it
      // (and disclosing the gap via the response body, visible in
      // Stripe's own dashboard logs) is correct, not silently swallowing
      // a real problem.
      return NextResponse.json({ status: "unrecognized_organization" }, { status: 200 });
    }
    throw error;
  }
}
