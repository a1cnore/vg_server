import { redirect } from "next/navigation";
import { loginAction } from "./actions";
import {
  isAdminAuthenticated,
  isAdminConfigured,
  sanitizeNextPath,
} from "@/lib/auth";

function getErrorMessage(error: string | string[] | undefined): string | null {
  if (error === "invalid") return "Wrong password.";
  if (error === "config") return "Admin login is not configured.";
  return null;
}

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextPath = sanitizeNextPath(resolvedSearchParams.next, "/matches");

  if (await isAdminAuthenticated()) {
    redirect(nextPath);
  }

  const errorMessage = getErrorMessage(resolvedSearchParams.error);
  const loginEnabled = isAdminConfigured();

  return (
    <main className="min-h-[calc(100vh-40px)] bg-page px-6 py-10 text-text-primary">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-md border border-border bg-card p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Admin Access</h1>
          <p className="text-sm text-text-secondary">
            Enter the admin password to unlock matches, users, and detail views.
          </p>
        </div>

        <form action={loginAction} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={nextPath} />
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              disabled={!loginEnabled}
              className="rounded-md border border-border bg-page px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-text-secondary"
            />
          </label>

          {errorMessage && (
            <p className="text-sm text-accent-red">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={!loginEnabled}
            className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-text-primary transition-colors hover:bg-border disabled:cursor-not-allowed disabled:text-text-dim"
          >
            Log In
          </button>
        </form>
      </div>
    </main>
  );
}
