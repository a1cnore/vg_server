import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const ADMIN_SESSION_COOKIE = "vg_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

function getAdminSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? "";
}

function sign(value: string): string {
  const secret = getAdminSessionSecret();
  if (!secret) return "";

  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

function createSessionValue(timestamp: number): string {
  const ts = String(timestamp);
  return `${ts}.${sign(ts)}`;
}

function isSessionValueValid(value: string | undefined): boolean {
  if (!value) return false;

  const [timestampRaw, signature] = value.split(".", 2);
  const timestamp = Number(timestampRaw);

  if (!timestampRaw || !signature || !Number.isFinite(timestamp)) {
    return false;
  }

  if (Date.now() - timestamp > SESSION_MAX_AGE_SECONDS * 1000) {
    return false;
  }

  const expected = sign(timestampRaw);
  if (!expected) return false;

  return safeEqual(signature, expected);
}

export function isAdminConfigured(): boolean {
  return Boolean(getAdminPassword() && getAdminSessionSecret());
}

export function validateAdminPassword(password: string): boolean {
  const configuredPassword = getAdminPassword();
  if (!configuredPassword) return false;

  return safeEqual(password, configuredPassword);
}

export function sanitizeNextPath(
  nextPath: string | string[] | undefined,
  fallback = "/matches"
): string {
  if (typeof nextPath !== "string") return fallback;
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) return fallback;
  if (nextPath.startsWith("/api/")) return fallback;
  if (nextPath === "/admin") return fallback;

  return nextPath;
}

export function getAdminLoginHref(nextPath: string): string {
  return `/admin?next=${encodeURIComponent(nextPath)}`;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return isSessionValueValid(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function setAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, createSessionValue(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export async function requireAdminPage(nextPath: string): Promise<void> {
  if (await isAdminAuthenticated()) return;

  redirect(getAdminLoginHref(nextPath));
}
