"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Blueprint } from "../domain/entities/blueprint";
import { planDigitization } from "../public";
import { RestError } from "@/shared/infrastructure/rest-client";

export type BlueprintSaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

/** Keeps local edits visible while reporting the actual result of each REST save. */
export function useBlueprintSave() {
  const [status, setStatus] = useState<BlueprintSaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const latestDraft = useRef<Blueprint | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (status === "saved") return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [status]);

  const draft = useCallback((blueprint: Blueprint) => {
    latestDraft.current = blueprint;
    generation.current += 1;
    setError(null);
    setStatus("pending");
  }, []);

  const commit = useCallback(async (blueprint: Blueprint) => {
    latestDraft.current = blueprint;
    const version = ++generation.current;
    setError(null);
    setStatus("saving");
    try {
      await planDigitization.saveBlueprint.execute(blueprint);
      if (generation.current === version) setStatus("saved");
    } catch (reason) {
      if (generation.current === version) {
        const conflict = reason instanceof RestError && reason.status === 409;
        setStatus(conflict ? "conflict" : "error");
        setError(reason instanceof Error ? reason.message : "Unknown save error");
      }
      throw reason;
    }
  }, []);

  const retry = useCallback(() => {
    if (!latestDraft.current) return Promise.resolve();
    return commit(latestDraft.current);
  }, [commit]);

  return { status, error, draft, commit, retry, latestDraft };
}
