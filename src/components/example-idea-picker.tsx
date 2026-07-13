"use client";

import { useState } from "react";

/**
 * Master Spec §6 Simple Mode, AS-0001's designated "first vertical proof"
 * (execution/state.json's architecturalStandards): a real, working example
 * — not a decorative mockup — of the "practical product completeness"
 * standard applied to Pocket Studio's own UI, not just generated products.
 *
 * Real, native `<button>` elements: keyboard (Enter/Space) and touch
 * support come from the browser's own button semantics, not custom
 * hand-rolled handlers — the same "use the real primitive, not a styled
 * div" discipline as the Structured Renderer (component-renderer.tsx).
 * `role="group"`/`aria-label` give the chip row real, not decorative,
 * accessible grouping. Selecting a chip sets real React state shared with
 * the textarea below it, so the populated text remains fully editable —
 * never a read-only preview — and repeated selection is a pure function of
 * which chip was clicked, always producing the same result.
 */
export const EXAMPLE_APP_IDEAS = [
  "Build a premium booking app for mobile detailers.",
  "Build a subscription box service for coffee lovers.",
  "Build a marketplace for local freelance photographers.",
] as const;

export type IdeaTextareaProps = {
  name: string;
  placeholder: string;
  initialValue?: string;
};

export function IdeaTextarea({ name, placeholder, initialValue = "" }: IdeaTextareaProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Example app ideas" className="flex flex-wrap gap-2">
        {EXAMPLE_APP_IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => setValue(idea)}
            className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {idea}
          </button>
        ))}
      </div>
      <textarea
        name={name}
        required
        rows={3}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
    </div>
  );
}
