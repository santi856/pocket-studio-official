import { describe, expect, it } from "vitest";
import { MockEmailProvider } from "./mock-provider";

describe("MockEmailProvider", () => {
  const provider = new MockEmailProvider();

  it("succeeds for a well-formed address", async () => {
    const result = await provider.sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result.status).toBe("SENT");
    expect(result).toHaveProperty("providerMessageId");
  });

  it("fails for a malformed address, the same as a real provider would reject it", async () => {
    const result = await provider.sendEmail({
      to: "not-an-email",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result.status).toBe("FAILED");
  });

  it("generates a unique message id per call", async () => {
    const first = await provider.sendEmail({ to: "a@example.com", subject: "x", text: "y" });
    const second = await provider.sendEmail({ to: "b@example.com", subject: "x", text: "y" });

    expect(first.status).toBe("SENT");
    expect(second.status).toBe("SENT");
    if (first.status === "SENT" && second.status === "SENT") {
      expect(first.providerMessageId).not.toBe(second.providerMessageId);
    }
  });
});
