import { EventEmitter } from "node:events";
import type { TLSSocket } from "node:tls";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SmtpEmailProvider as SmtpEmailProviderType, TlsConnectFn } from "./smtp-provider";

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

/**
 * A scripted fake TLS socket: each call to write() consumes the next
 * scripted server response and emits it asynchronously (via setImmediate,
 * a real macrotask — guaranteeing the promise chain in smtp-provider.ts
 * has already attached its 'data' listener by the time the response
 * fires, avoiding a synchronous-emit-before-listener race). Injected
 * directly via SmtpEmailProvider's constructor — no Node built-in module
 * mocking involved, which proved fragile (a misconfigured "node:tls" mock
 * silently fell through to a real network connection attempt in an
 * earlier version of this test, hanging for minutes).
 */
class FakeSmtpSocket extends EventEmitter {
  private readonly script: string[];
  public readonly writes: string[] = [];
  private readonly failConnect: boolean;

  constructor(script: string[], options: { failConnect?: boolean } = {}) {
    super();
    this.script = [...script];
    this.failConnect = options.failConnect ?? false;
  }

  simulateConnect() {
    setImmediate(() => {
      if (this.failConnect) {
        this.emit("error", new Error("ECONNREFUSED"));
        return;
      }
      this.emit("secureConnect");
      this.emitNextScriptedResponse();
    });
  }

  private emitNextScriptedResponse() {
    const next = this.script.shift();
    if (next === undefined) return;
    setImmediate(() => this.emit("data", Buffer.from(next)));
  }

  write(data: string, callback?: (error?: Error) => void) {
    this.writes.push(data);
    callback?.();
    this.emitNextScriptedResponse();
    return true;
  }

  end() {
    return this;
  }

  destroy() {
    return this;
  }
}

function connectFnFor(fakeSocket: FakeSmtpSocket): TlsConnectFn {
  return () => {
    fakeSocket.simulateConnect();
    return fakeSocket as unknown as TLSSocket;
  };
}

const HAPPY_PATH_SCRIPT = [
  "220 smtp.example.com ready\r\n",
  "250-smtp.example.com\r\n250 AUTH LOGIN\r\n",
  "334 VXNlcm5hbWU6\r\n",
  "334 UGFzc3dvcmQ6\r\n",
  "235 Authentication successful\r\n",
  "250 OK\r\n",
  "250 OK\r\n",
  "354 Start mail input\r\n",
  "250 OK queued as ABC123\r\n",
];

const FULLY_CONFIGURED_ENV = {
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USERNAME: "apikey",
  SMTP_PASSWORD: "secret",
  EMAIL_FROM_ADDRESS: "noreply@pocketstudio.example.com",
  DATABASE_URL: "postgresql://test",
  SESSION_SECRET: "x".repeat(32),
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
};

// getServerEnv() (src/lib/env.ts) caches its parse result at module scope
// — vi.resetModules() + a dynamic re-import per test is what actually
// forces a fresh read, matching the same pattern already proven reliable
// for the other provider test suites in this codebase (e.g.
// stripe-billing-provider.test.ts).
async function loadProvider(connectFn: TlsConnectFn): Promise<SmtpEmailProviderType> {
  vi.resetModules();
  const { SmtpEmailProvider } = await import("./smtp-provider");
  return new SmtpEmailProvider(connectFn);
}

describe("SmtpEmailProvider", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("completes the real SMTP conversation and returns the provider's queued message id", async () => {
    setEnv(FULLY_CONFIGURED_ENV);
    const fakeSocket = new FakeSmtpSocket(HAPPY_PATH_SCRIPT);
    const provider = await loadProvider(connectFnFor(fakeSocket));

    const result = await provider.sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result).toEqual({ status: "SENT", providerMessageId: "ABC123" });
    expect(fakeSocket.writes.some((w) => w.startsWith("EHLO"))).toBe(true);
    expect(
      fakeSocket.writes.some((w) => w.startsWith("MAIL FROM:<noreply@pocketstudio.example.com>")),
    ).toBe(true);
    expect(fakeSocket.writes.some((w) => w.startsWith("RCPT TO:<customer@example.com>"))).toBe(
      true,
    );
    // The password is base64-encoded, per AUTH LOGIN — never sent or
    // logged in plaintext.
    expect(fakeSocket.writes.join("")).not.toContain("secret");
  });

  it("fails gracefully when the server rejects authentication", async () => {
    setEnv(FULLY_CONFIGURED_ENV);
    const fakeSocket = new FakeSmtpSocket([
      "220 smtp.example.com ready\r\n",
      "250 smtp.example.com\r\n",
      "334 VXNlcm5hbWU6\r\n",
      "334 UGFzc3dvcmQ6\r\n",
      "535 Authentication failed\r\n",
    ]);
    const provider = await loadProvider(connectFnFor(fakeSocket));

    const result = await provider.sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.failureReason).toContain("535");
    }
  });

  it("fails gracefully when the connection itself fails", async () => {
    setEnv(FULLY_CONFIGURED_ENV);
    const fakeSocket = new FakeSmtpSocket([], { failConnect: true });
    const provider = await loadProvider(connectFnFor(fakeSocket));

    const result = await provider.sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result.status).toBe("FAILED");
  });

  it("fails gracefully when the recipient is rejected mid-conversation", async () => {
    setEnv(FULLY_CONFIGURED_ENV);
    const fakeSocket = new FakeSmtpSocket([
      "220 smtp.example.com ready\r\n",
      "250 smtp.example.com\r\n",
      "334 VXNlcm5hbWU6\r\n",
      "334 UGFzc3dvcmQ6\r\n",
      "235 Authentication successful\r\n",
      "250 OK\r\n",
      "550 No such user here\r\n",
    ]);
    const provider = await loadProvider(connectFnFor(fakeSocket));

    const result = await provider.sendEmail({
      to: "nobody@example.com",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result.status).toBe("FAILED");
    if (result.status === "FAILED") {
      expect(result.failureReason).toContain("550");
    }
  });

  it("fails without connecting when SMTP is not fully configured", async () => {
    setEnv({
      EMAIL_PROVIDER: "mock",
      DATABASE_URL: "postgresql://test",
      SESSION_SECRET: "x".repeat(32),
      CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    });
    let called = false;
    const provider = await loadProvider(() => {
      called = true;
      throw new Error("should not be called");
    });

    const result = await provider.sendEmail({
      to: "customer@example.com",
      subject: "Welcome",
      text: "Hello!",
    });

    expect(result.status).toBe("FAILED");
    expect(called).toBe(false);
  });
});
