"use client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Recoverable boundary for route-level workspace failures. */
export default function WorkspaceError({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="pm-card pm-empty" role="alert">
      <h2>{t("pm.unavailable")}</h2>
      <button className="pm-button" onClick={reset}>
        {t("pm.retry")}
      </button>
    </div>
  );
}
