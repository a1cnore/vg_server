"use server";

import { redirect } from "next/navigation";
import {
  clearAdminSession,
  isAdminConfigured,
  sanitizeNextPath,
  setAdminSession,
  validateAdminPassword,
} from "@/lib/auth";

function getLoginErrorRedirect(nextPath: string, error: string): string {
  const params = new URLSearchParams({
    error,
    next: nextPath,
  });

  return `/admin?${params.toString()}`;
}

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const nextValue = formData.get("next");
  const nextPath = sanitizeNextPath(
    typeof nextValue === "string" ? nextValue : undefined,
    "/matches"
  );

  if (!isAdminConfigured()) {
    redirect(getLoginErrorRedirect(nextPath, "config"));
  }

  if (!validateAdminPassword(password)) {
    redirect(getLoginErrorRedirect(nextPath, "invalid"));
  }

  await setAdminSession();
  redirect(nextPath);
}

export async function logoutAction(): Promise<void> {
  await clearAdminSession();
  redirect("/");
}
