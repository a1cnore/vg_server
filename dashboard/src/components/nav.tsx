"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin
    ? [
        { href: "/", label: "Overview" },
        { href: "/matches", label: "Matches" },
        { href: "/users", label: "Users" },
        { href: "/balance", label: "Balance" },
      ]
    : [
        { href: "/", label: "Overview" },
        { href: "/balance", label: "Balance" },
      ];

  return (
    <nav className="fixed top-0 z-50 flex h-10 w-full items-center border-b border-border bg-page/95 px-4 backdrop-blur-sm">
      <div className="mr-8 flex items-center gap-1.5">
        <span className="text-sm font-bold text-accent-cyan">VG</span>
        <span className="text-xs text-text-dim tracking-wider">DASHBOARD</span>
      </div>

      <div className="flex items-center gap-4">
        {links.map((link) => {
          const active = link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative px-1 py-2.5 text-xs transition-colors",
                active
                  ? "text-white"
                  : "text-text-dim hover:text-text-secondary"
              )}
            >
              {link.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
              )}
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-4 text-xs text-text-dim">
        {isAdmin ? (
          <>
            <span className="text-text-secondary">Admin</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-text-dim transition-colors hover:text-text-primary"
              >
                Log Out
              </button>
            </form>
          </>
        ) : (
          <span className="text-text-secondary">Guest Mode</span>
        )}
      </div>
    </nav>
  );
}
