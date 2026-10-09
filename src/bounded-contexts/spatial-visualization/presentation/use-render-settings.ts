"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface RenderSettings {
  exposure: number;
  sunAzimuth: number;
  sunElevation: number;
  shadows: boolean;
}
const defaults: RenderSettings = {
  exposure: 1,
  sunAzimuth: 45,
  sunElevation: 45,
  shadows: true,
};
const eventName = "ark:render-settings";
const subscribe = (notify: () => void) => {
  window.addEventListener(eventName, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(eventName, notify);
    window.removeEventListener("storage", notify);
  };
};

/** Per-project presentation settings never mutate architectural geometry. */
export function useRenderSettings(projectId: string) {
  const key = `ark.render.v1.${projectId}`;
  const snapshot = useCallback(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key]);
  const value = useSyncExternalStore(subscribe, snapshot, () => "");
  const settings = useMemo(() => {
    try {
      const parsed = JSON.parse(value) as Partial<RenderSettings>;
      const bounded = (
        value: unknown,
        min: number,
        max: number,
        fallback: number,
      ) =>
        typeof value === "number" && Number.isFinite(value)
          ? Math.min(max, Math.max(min, value))
          : fallback;
      return {
        exposure: bounded(parsed.exposure, 0.5, 2, 1),
        sunAzimuth: bounded(parsed.sunAzimuth, 0, 360, 45),
        sunElevation: bounded(parsed.sunElevation, 5, 85, 45),
        shadows: typeof parsed.shadows === "boolean" ? parsed.shadows : true,
      };
    } catch {
      return defaults;
    }
  }, [value]);
  const update = (patch: Partial<RenderSettings>) => {
    try {
      localStorage.setItem(key, JSON.stringify({ ...settings, ...patch }));
      window.dispatchEvent(new Event(eventName));
    } catch {
      /* Storage may be disabled by the browser; geometry remains unaffected. */
    }
  };
  return { settings, update };
}

const subscribeQuality = (notify: () => void) => {
  window.addEventListener("ark:preferences-changed", notify);
  return () =>
    window.removeEventListener("ark:preferences-changed", notify);
};
export function useRenderQuality() {
  return useSyncExternalStore(
    subscribeQuality,
    () => document.documentElement.dataset.renderQuality ?? "balanced",
    () => "balanced",
  );
}
