"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Overview" },
  { href: "/matches", label: "Matches" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 z-50 flex h-10 w-full items-center border-b border-border bg-page/95 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 mr-8">
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
        <span className="px-1 py-2.5 text-xs text-text-dim cursor-default">
          Users
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4 text-xs text-text-dim">
        <span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-green mr-1.5" />
          <span className="font-mono">--</span> users
        </span>
        <span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-cyan mr-1.5" />
          <span className="font-mono">--</span> live
        </span>
      </div>
    </nav>
  );
}
