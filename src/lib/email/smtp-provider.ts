import "server-only";
import { connect as tlsConnect } from "node:tls";
import type { ConnectionOptions, TLSSocket } from "node:tls";

/** Injectable so tests can supply a fully scripted fake socket without mocking the "node:tls" module itself. */
export type TlsConnectFn = (options: ConnectionOptions) => TLSSocket;
import { getServerEnv } from "@/lib/env";
import type { EmailProvider, EmailSendResult, SendEmailInput } from "./provider";

export class SmtpConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpConnectionError";
  }
}

const CONNECTION_TIMEOUT_MS = 15_000;

/**
 * Reads until a line matching SMTP's multi-line-response terminator (RFC
 * 5321 §4.2.1 — a 3-digit code followed by a space, not a dash) appears,
 * then resolves with the full accumulated response text and status code.
 */
function readResponse(socket: TLSSocket): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n").filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (lastLine && /^\d{3} /.test(lastLine)) {
        cleanup();
        resolve({ code: Number(lastLine.slice(0, 3)), text: buffer });
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function writeCommand(socket: TLSSocket, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(`${command}\r\n`, (error) => (error ? reject(error) : resolve()));
  });
}

/** Sends `command` (or nothing, for reading the initial greeting) and asserts the response code. */
async function expectCode(
  socket: TLSSocket,
  command: string | null,
  expectedCodes: number[],
): Promise<string> {
  if (command !== null) {
    await writeCommand(socket, command);
  }
  const response = await readResponse(socket);
  if (!expectedCodes.includes(response.code)) {
    throw new SmtpConnectionError(
      `Expected SMTP response ${expectedCodes.join("/")}, got ${response.code}: ${response.text.trim()}`,
    );
  }
  return response.text;
}

function buildMessage(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): string {
  const messageId = `<${crypto.randomUUID()}@pocketstudio>`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];

  if (!input.html) {
    return [...headers, "Content-Type: text/plain; charset=utf-8", "", input.text].join("\r\n");
  }

  const boundary = `----=_PocketStudio_${crypto.randomUUID()}`;
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    input.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/**
 * A real SMTP client (RFC 5321) implemented directly over Node's built-in
 * `tls` module — no SMTP library dependency, matching this codebase's
 * established "raw protocol implementation over an SDK" precedent (P3-01
 * D-0047, P3-04 D-0050, P3-06 D-0052). Connects with implicit TLS
 * (typically port 465) rather than negotiating STARTTLS — the simpler,
 * equally standard alternative, proportional for a client that only needs
 * to speak to one already-configured server. Supports AUTH LOGIN only
 * (the single most widely-supported SMTP auth mechanism) — a disclosed,
 * deliberate scope limit, not a universal SMTP client.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp" as const;

  constructor(private readonly connectFn: TlsConnectFn = tlsConnect) {}

  async sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
    const env = getServerEnv();
    if (
      !env.SMTP_HOST ||
      !env.SMTP_PORT ||
      !env.SMTP_USERNAME ||
      !env.SMTP_PASSWORD ||
      !env.EMAIL_FROM_ADDRESS
    ) {
      return { status: "FAILED", failureReason: "SMTP is not fully configured." };
    }

    let socket: TLSSocket | undefined;
    try {
      socket = this.connectFn({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        timeout: CONNECTION_TIMEOUT_MS,
      });

      await new Promise<void>((resolve, reject) => {
        socket!.once("secureConnect", resolve);
        socket!.once("error", reject);
        socket!.once("timeout", () =>
          reject(new SmtpConnectionError(`Connection to ${env.SMTP_HOST} timed out.`)),
        );
      });

      await expectCode(socket, null, [220]);
      await expectCode(socket, "EHLO pocketstudio", [250]);
      await expectCode(socket, "AUTH LOGIN", [334]);
      await expectCode(socket, Buffer.from(env.SMTP_USERNAME).toString("base64"), [334]);
      await expectCode(socket, Buffer.from(env.SMTP_PASSWORD).toString("base64"), [235]);
      await expectCode(socket, `MAIL FROM:<${env.EMAIL_FROM_ADDRESS}>`, [250]);
      await expectCode(socket, `RCPT TO:<${input.to}>`, [250, 251]);
      await expectCode(socket, "DATA", [354]);

      const message = buildMessage({
        from: env.EMAIL_FROM_ADDRESS,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      const response = await expectCode(socket, `${message}\r\n.`, [250]);
      const messageIdMatch = response.match(/queued as (\S+)/i);

      await writeCommand(socket, "QUIT");

      return {
        status: "SENT",
        providerMessageId: messageIdMatch?.[1] ?? `smtp_${crypto.randomUUID()}`,
      };
    } catch (error) {
      return {
        status: "FAILED",
        failureReason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      socket?.destroy();
    }
  }
}
