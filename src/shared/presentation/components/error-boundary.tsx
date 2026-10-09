"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; }

/** Prevents an isolated presentation failure from blanking the entire app. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ark presentation error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f4ef] p-6">
        <section className="max-w-md rounded-3xl border border-[#dfe2d9] bg-white p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 text-[#d94c3d]" />
          <h1 className="text-xl font-semibold">Something went off plan</h1>
          <p className="mt-2 text-sm text-[#66736d]">Reload the workspace to restore the last stable state.</p>
          <button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#30382f] px-4 py-2.5 text-sm font-semibold text-white">Reload workspace</button>
        </section>
      </main>
    );
  }
}
