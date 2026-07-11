import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV is the GCM-recommended size.

export type EncryptedPayload = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
};

function getKey(): Buffer {
  return Buffer.from(getServerEnv().CREDENTIAL_ENCRYPTION_KEY, "base64");
}

/**
 * AES-256-GCM: the credential vault's only encryption primitive (Master
 * Spec §4.7, §30 — "encrypted server-side credential storage"). A fresh
 * random IV is generated per call; reusing an IV with the same key would
 * break GCM's confidentiality guarantee, so this never accepts a caller-
 * supplied IV.
 */
export function encryptSecret(plainText: string): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const plainText = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plainText.toString("utf8");
}
