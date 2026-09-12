"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
export function InvitationScreen({ token }: { token: string }) {
  const router = useRouter(),
    { t } = useI18n();
  const [invite, setInvite] = useState<{
      project_name: string;
      role: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void requestJson<{ project_name: string; role: string }>(
      "/api/v1/invitations/" + token,
    )
      .then(setInvite)
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <div className="pm-workspace pm-card collab-invitation">
      <p className="pm-eyebrow">{t("c.invitation")}</p>
      <h1>{invite?.project_name ?? t("c.loading")}</h1>
      {invite && (
        <p>
          {t("c.role")}: {t("c." + invite.role)}
        </p>
      )}
      {error && (
        <p role="alert" className="pm-alert pm-danger">
          {error}
        </p>
      )}
      <button
        className="pm-button pm-primary"
        disabled={!invite || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await requestJson<{ project_id: string }>(
              "/api/v1/invitations/" + token,
              { method: "POST", body: "{}" },
            );
            router.push("/projects/" + result.project_id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("c.acceptInvitation")}
      </button>
    </div>
  );
}
