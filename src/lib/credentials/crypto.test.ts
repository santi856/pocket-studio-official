// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret exactly", () => {
    const payload = encryptSecret("sk_live_super_secret_value");
    expect(decryptSecret(payload)).toBe("sk_live_super_secret_value");
  });

  it("never stores the plaintext in the ciphertext", () => {
    const payload = encryptSecret("sk_live_super_secret_value");
    expect(payload.ciphertext).not.toContain("sk_live_super_secret_value");
  });

  it("produces a different ciphertext each time (fresh IV per call)", () => {
    const first = encryptSecret("same-secret");
    const second = encryptSecret("same-secret");
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
  });

  it("fails closed when the auth tag has been tampered with", () => {
    const payload = encryptSecret("sk_live_super_secret_value");
    const tampered = { ...payload, authTag: encryptSecret("different").authTag };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("fails closed when the ciphertext has been tampered with", () => {
    const payload = encryptSecret("sk_live_super_secret_value");
    const tampered = { ...payload, ciphertext: encryptSecret("different").ciphertext };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
