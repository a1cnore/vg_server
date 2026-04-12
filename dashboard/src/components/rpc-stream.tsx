"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface RpcLog {
  id: number;
  ts: string;
  method: string;
  category: string | null;
  status: number | null;
  url: string | null;
  req: unknown;
  res: unknown;
}

interface RpcStreamProps {
  logs: RpcLog[];
}

const categoryColor: Record<string, string> = {
  auth: "bg-accent-cyan/15 text-accent-cyan",
  social: "bg-purple-500/15 text-purple-400",
  inventory: "bg-accent-gold/15 text-accent-gold",
  match: "bg-accent-red/15 text-accent-red",
};

const defaultCategoryColor = "bg-border text-text-dim";

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false });
  } catch {
    return ts;
  }
}

export function RpcStream({ logs }: RpcStreamProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div
      ref={containerRef}
      className="max-h-96 overflow-y-auto border border-border rounded-md bg-card"
    >
      <table className="w-full text-left">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            <th className="px-2 py-1.5 text-[11px] font-medium text-text-dim uppercase tracking-wider">
              Time
            </th>
            <th className="px-2 py-1.5 text-[11px] font-medium text-text-dim uppercase tracking-wider">
              Cat
            </th>
            <th className="px-2 py-1.5 text-[11px] font-medium text-text-dim uppercase tracking-wider">
              Method
            </th>
            <th className="px-2 py-1.5 text-[11px] font-medium text-text-dim uppercase tracking-wider text-right">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <Fragment key={log.id} log={log} expandedId={expandedId} setExpandedId={setExpandedId} />
          ))}
        </tbody>
      </table>
      {logs.length === 0 && (
        <div className="px-3 py-4 text-xs text-text-dim text-center">
          No RPC traffic
        </div>
      )}
    </div>
  );
}

function Fragment({
  log,
  expandedId,
  setExpandedId,
}: {
  log: RpcLog;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
}) {
  const expanded = expandedId === log.id;
  const ok = log.status !== null && log.status >= 200 && log.status < 300;
  const catStyle = log.category
    ? (categoryColor[log.category] ?? defaultCategoryColor)
    : defaultCategoryColor;

  return (
    <>
      <tr
        className="border-b border-border cursor-pointer hover:bg-panel/50"
        onClick={() => setExpandedId(expanded ? null : log.id)}
      >
        <td className="px-2 py-1 font-mono text-xs text-text-dim">
          {formatTs(log.ts)}
        </td>
        <td className="px-2 py-1">
          {log.category && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                catStyle
              )}
            >
              {log.category}
            </span>
          )}
        </td>
        <td className="px-2 py-1 text-xs text-text-primary font-mono">
          {log.method}
        </td>
        <td
          className={cn(
            "px-2 py-1 font-mono text-xs text-right",
            log.status === null
              ? "text-text-dim"
              : ok
                ? "text-accent-green"
                : "text-accent-red"
          )}
        >
          {log.status ?? "--"}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="bg-page px-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase text-text-dim mb-1">Request</div>
                <pre className="font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {JSON.stringify(log.req, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-[10px] uppercase text-text-dim mb-1">Response</div>
                <pre className="font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {JSON.stringify(log.res, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
