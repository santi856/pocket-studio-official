"use server";

import { redirect } from "next/navigation";
import {
  registerUser,
  authenticateUser,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  WeakPasswordError,
} from "@/lib/services/users";
import { TooManyLoginAttemptsError } from "@/lib/auth/login-rate-limit";
import { createSession, deleteSessionByToken } from "@/lib/auth/session";
import {
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromCookies,
} from "@/lib/auth/cookies";
import { getClientIp } from "@/lib/web/client-ip";

export async function signUpAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  let user;
  try {
    user = await registerUser({ email, password, name });
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError || error instanceof WeakPasswordError) {
      redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  redirect("/onboarding");
}

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const ipAddress = await getClientIp();

  let user;
  try {
    user = await authenticateUser({ email, password, ipAddress });
  } catch (error) {
    if (error instanceof InvalidCredentialsError || error instanceof TooManyLoginAttemptsError) {
      redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const token = await getSessionTokenFromCookies();
  if (token) {
    await deleteSessionByToken(token);
  }
  await clearSessionCookie();
  redirect("/");
}
