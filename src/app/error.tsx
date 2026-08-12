"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f4f4ef] p-6">
      <div className="max-w-md rounded-3xl border border-[#dfe2d9] bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-4 text-[#d94c3d]" size={28} />
        <h2 className="text-xl font-semibold">This view could not be loaded</h2>
        <p className="mt-2 text-sm leading-6 text-[#66736d]">Your project data is safe. Retry the view or return to the projects dashboard.</p>
        <button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#30382f] px-4 py-2.5 text-sm font-semibold text-white">
          <RotateCcw size={15} /> Retry
        </button>
      </div>
    </div>
  );
}
