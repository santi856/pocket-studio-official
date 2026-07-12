import type { TruthStatusValue } from "@/generated/prisma/client";

const STYLES: Record<TruthStatusValue, string> = {
  IMPLEMENTED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
  PLANNED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400",
  MISSING: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  BLOCKED: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400",
  UNSUPPORTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
  NOT_EVALUATED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

const LABELS: Record<TruthStatusValue, string> = {
  IMPLEMENTED: "Implemented",
  PLANNED: "Planned",
  MISSING: "Missing",
  BLOCKED: "Blocked",
  UNSUPPORTED: "Unsupported",
  NOT_EVALUATED: "Not evaluated",
};

export function TruthBadge({ status }: { status: TruthStatusValue }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
