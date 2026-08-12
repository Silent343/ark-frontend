import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-[#dfe2d9] bg-[#fbfbf7] shadow-[0_1px_2px_rgba(17,24,21,.04)] ${className}`}>{children}</section>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`relative overflow-hidden rounded-xl bg-[#e4e6df] before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent before:[animation:shimmer_1.5s_infinite] ${className}`} />;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-5 border-b border-[#dfe2d9] pb-7 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[.22em] text-[#78837d]">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-[-.04em] text-[#111815] sm:text-[2.15rem]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66736d]">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Panel className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <AlertCircle className="mx-auto text-[#d94c3d]" size={28} />
        <h2 className="mt-4 font-semibold">Unable to load this workspace</h2>
        <p className="mt-2 text-sm text-[#66736d]">{message}</p>
        <button onClick={onRetry} className="mt-5 rounded-xl bg-[#30382f] px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
      </div>
    </Panel>
  );
}
