"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import type { SessionUser } from "../index";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
import { AuthScreen, type AuthMode, type AuthPayload } from "./auth-screen";
type Session = { user: SessionUser | null; setup_required?: boolean };
const Auth = createContext<{
  user: SessionUser;
  signOut: () => Promise<void>;
} | null>(null);
/** Holds only the public identity; the HTTP-only session secret is inaccessible to client code. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null),
    [mode, setMode] = useState<AuthMode>("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const next = await requestJson<Session>("/api/v1/sessions");
      setSession(next);
      setMode(next.setup_required ? "register" : "login");
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
    window.addEventListener("ark:session-expired", expired);
    return () => window.removeEventListener("ark:session-expired", expired);
  }, []);
  const authenticate = async (nextMode: AuthMode, payload: AuthPayload) => {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<Session>(
        nextMode === "register" ? "/api/v1/users" : "/api/v1/sessions",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setSession(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!session) return (
      <main className="auth-shell auth-loading">
        <div className="auth-loading-card">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button className="auth-submit" onClick={() => void refresh()}>
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
      </main>
  );
  if (!session.user) return (
    <AuthScreen
      mode={mode}
      setupRequired={!!session.setup_required}
      busy={busy}
      error={error}
      onModeChange={(next) => { setMode(next); setError(""); }}
      onAuthenticate={authenticate}
    />
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
