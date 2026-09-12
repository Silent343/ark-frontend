"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { LogOut, Building2, ArrowRight, LoaderCircle } from "lucide-react";
import type { SessionUser } from "../index";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
type Session = { user: SessionUser | null; setup_required?: boolean };
const Auth = createContext<{
  user: SessionUser;
  signOut: () => Promise<void>;
} | null>(null);
/** Holds only the public identity; the HTTP-only session secret is inaccessible to client code. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null),
    [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const next = await requestJson<Session>("/api/v1/sessions");
      setSession(next);
      setRegister(!!next.setup_required);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const expired = () => setSession({ user: null });
    window.addEventListener("teluria:session-expired", expired);
    return () => window.removeEventListener("teluria:session-expired", expired);
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<Session>(
        register ? "/api/v1/users" : "/api/v1/sessions",
        { method: "POST", body: JSON.stringify(Object.fromEntries(form)) },
      );
      setSession(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!session)
    return (
      <div className="collab-auth">
        <div className="pm-card collab-auth-card">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button className="pm-button" onClick={() => void refresh()}>
                {t("pm.retry")}
              </button>
            </>
          ) : (
            <LoaderCircle
              className="animate-spin"
              aria-label={t("c.loading")}
            />
          )}
        </div>
      </div>
    );
  if (!session.user)
    return (
      <div className="collab-auth">
        <div className="collab-auth-story">
          <Building2 size={40} />
          <p className="pm-eyebrow">TELURIA · WORKSPACE</p>
          <h1>{t("c.authTitle")}</h1>
          <p>{t("c.authDescription")}</p>
          <div className="collab-auth-points">
            {["team", "schedule", "deliverables"].map((k) => (
              <span key={k}>{t("c." + k)}</span>
            ))}
          </div>
        </div>
        <div className="pm-card collab-auth-card">
          <h2>{t(register ? "c.createAccount" : "c.signIn")}</h2>
          <p>
            {t(session.setup_required ? "c.firstAccount" : "c.accountHelp")}
          </p>
          <form className="pm-form" onSubmit={submit}>
            {register && (
              <label className="pm-field">
                <span>{t("pm.field.name")}</span>
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            <label className="pm-field">
              <span>{t("c.email")}</span>
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label className="pm-field">
              <span>{t("c.password")}</span>
              <input
                name="password"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
              {register && <small>{t("c.passwordHelp")}</small>}
            </label>
            {error && (
              <p className="pm-alert pm-danger" role="alert">
                {error}
              </p>
            )}
            <button disabled={busy} className="pm-button pm-primary">
              {busy ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <ArrowRight size={16} />
              )}{" "}
              {t(register ? "c.createAccount" : "c.signIn")}
            </button>
            {!session.setup_required && (
              <button
                type="button"
                className="pm-text-button"
                onClick={() => {
                  setRegister(!register);
                  setError("");
                }}
              >
                {t(register ? "c.haveAccount" : "c.noAccount")}
              </button>
            )}
          </form>
        </div>
      </div>
    );
  return (
    <Auth.Provider
      value={{
        user: session.user,
        signOut: async () => {
          await requestJson("/api/v1/sessions", { method: "DELETE" });
          setSession({ user: null });
        },
      }}
    >
      <div key={session.user.id}>{children}</div>
    </Auth.Provider>
  );
}
export function useAuth() {
  const value = useContext(Auth);
  if (!value) throw new Error("Authenticated session required.");
  return value;
}
export function SessionBar() {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  return (
    <div className="collab-session">
      <span>
        {user.name}
        <small>{user.email}</small>
      </span>
      <button className="pm-button pm-small" onClick={() => void signOut()}>
        <LogOut size={14} />
        {t("c.signOut")}
      </button>
    </div>
  );
}
