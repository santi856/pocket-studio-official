import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { User } from "@/generated/prisma/client";

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Incorrect email or password.");
    this.name = "InvalidCredentialsError";
  }
}

export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<User> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const passwordHash = await hashPassword(input.password);

  return db.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: input.name?.trim() || null,
    },
  });
}

export async function authenticateUser(input: { email: string; password: string }): Promise<User> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  return user;
}
