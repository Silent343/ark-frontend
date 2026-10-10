"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
  Users,
} from "lucide-react";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

export type AuthMode = "login" | "register";
export type AuthPayload = Record<string, string | boolean>;

interface AuthScreenProps {
  mode: AuthMode;
  setupRequired: boolean;
  busy: boolean;
  error: string;
  onModeChange: (mode: AuthMode) => void;
  onAuthenticate: (mode: AuthMode, payload: AuthPayload) => Promise<void>;
}

/** Focused IAM entry point: one primary task, progressive disclosure and no password persistence. */
export function AuthScreen({
  mode,
  setupRequired,
  busy,
  error,
  onModeChange,
  onAuthenticate,
}: AuthScreenProps) {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState("");
  const registering = mode === "register";

  const passwordChecks = useMemo(
    () => [
      { label: t("c.passwordLength"), valid: password.length >= 12 },
      { label: t("c.passwordLetter"), valid: /[A-Za-z]/.test(password) },
      { label: t("c.passwordNumber"), valid: /\d/.test(password) },
    ],
    [password, t],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const secret = String(form.get("password") || "");
    setClientError("");

    if (registering && secret !== String(form.get("confirm_password") || "")) {
      setClientError(t("c.passwordMismatch"));
      return;
    }

    const payload: AuthPayload = registering
      ? {
          name: String(form.get("name") || ""),
          email,
          password: secret,
          terms_accepted: form.get("legal_consent") === "on",
          privacy_accepted: form.get("legal_consent") === "on",
        }
      : {
          email,
          password: secret,
          remember_me: form.get("remember_me") === "on",
        };
    await onAuthenticate(mode, payload);
  };

  const changeMode = (next: AuthMode) => {
    setPassword("");
    setClientError("");
    onModeChange(next);
  };

  return (
    <main className="auth-shell">
      <section className="auth-access">
        <div className="auth-brand">
          <Image src="/ark-logo.svg" alt="" width={42} height={42} priority unoptimized />
          <div>
            <strong>Ark</strong>
            <span>{t("c.brandTagline")}</span>
          </div>
        </div>

        <div className="auth-form-frame">
          <div className="auth-form-heading">
            <p className="auth-kicker">{registering ? t("c.newAccess") : t("c.welcomeBack")}</p>
            <h1>{t(registering ? "c.createAccount" : "c.signIn")}</h1>
            <p>{t(setupRequired ? "c.firstAccount" : registering ? "c.registerHelp" : "c.accountHelp")}</p>
          </div>

          {!setupRequired && (
            <div className="auth-mode-switch" role="tablist" aria-label={t("c.accessMode")}>
              <button type="button" role="tab" aria-selected={!registering} onClick={() => changeMode("login")}>{t("c.signIn")}</button>
              <button type="button" role="tab" aria-selected={registering} onClick={() => changeMode("register")}>{t("c.createAccount")}</button>
            </div>
          )}

          <form className="auth-form" onSubmit={submit} aria-busy={busy} noValidate={false}>
            {registering && (
              <label className="auth-field" htmlFor="auth-name">
                <span>{t("pm.field.name")}</span>
                <span className="auth-input-control">
                  <UserRound aria-hidden="true" />
                  <input id="auth-name" name="name" required maxLength={100} autoComplete="name" placeholder={t("c.namePlaceholder")} />
                </span>
              </label>
            )}

            <label className="auth-field" htmlFor="auth-email">
              <span>{t("c.email")}</span>
              <span className="auth-input-control">
                <Mail aria-hidden="true" />
                <input id="auth-email" name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="nombre@estudio.com" />
              </span>
            </label>

            <label className="auth-field" htmlFor="auth-password">
              <span>{t("c.password")}</span>
              <span className="auth-input-control auth-password-control">
                <KeyRound aria-hidden="true" />
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={registering ? 12 : 1}
                  maxLength={128}
                  autoComplete={registering ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={registering ? "password-requirements" : undefined}
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={t(showPassword ? "c.hidePassword" : "c.showPassword")}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {registering && (
              <>
                <label className="auth-field" htmlFor="auth-password-confirmation">
                  <span>{t("c.confirmPassword")}</span>
                  <span className="auth-input-control">
                    <LockKeyhole aria-hidden="true" />
                    <input id="auth-password-confirmation" name="confirm_password" type={showPassword ? "text" : "password"} required minLength={12} maxLength={128} autoComplete="new-password" />
                  </span>
                </label>
                <div id="password-requirements" className="auth-password-rules">
                  {passwordChecks.map((check) => (
                    <span key={check.label} data-valid={check.valid}><Check size={12} aria-hidden="true" /> {check.label}</span>
                  ))}
                </div>
                <label className="auth-check">
                  <input name="legal_consent" type="checkbox" required />
                  <span>{t("c.acceptLegalPrefix")} <a href="/legal/terms.html" target="_blank" rel="noreferrer">{t("c.terms")}</a> {t("c.and")} <a href="/legal/privacy.html" target="_blank" rel="noreferrer">{t("c.privacy")}</a>.</span>
                </label>
              </>
            )}

            {!registering && (
              <div className="auth-form-options">
                <label className="auth-check"><input name="remember_me" type="checkbox" /><span>{t("c.rememberMe")}</span></label>
                <span>{t("c.sessionDeviceHint")}</span>
              </div>
            )}

            {(clientError || error) && <p className="auth-error" role="alert">{clientError || error}</p>}

            <button disabled={busy} className="auth-submit">
              <span>{t(registering ? "c.createAccount" : "c.signIn")}</span>
              {busy ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowRight size={17} />}
            </button>
          </form>

          <p className="auth-support"><LockKeyhole size={13} aria-hidden="true" /> {t("c.accessSupport")}</p>
        </div>
      </section>

      <aside className="auth-context" aria-label={t("c.authOverview")}>
        <div className="auth-context-copy">
          <p className="auth-context-kicker"><span /> {t("c.secureWorkspace")}</p>
          <h2>{t("c.authTitle")}</h2>
          <p>{t("c.authDescription")}</p>
        </div>

        <div className="auth-model-stage" aria-hidden="true">
          <span className="auth-axis auth-axis-x">X</span>
          <span className="auth-axis auth-axis-y">Y</span>
          <svg viewBox="0 0 720 430" role="presentation">
            <defs>
              <linearGradient id="ark-slab" x1="0" x2="1">
                <stop offset="0" stopColor="#25334e" />
                <stop offset="1" stopColor="#17223a" />
              </linearGradient>
            </defs>
            <path className="auth-model-ground" d="M82 326 353 169 640 316 365 481Z" />
            <g className="auth-model-building">
              <path className="auth-model-face" d="M197 264 353 174 353 335 197 424Z" />
              <path className="auth-model-face auth-model-face-right" d="M353 174 527 263 527 424 353 335Z" />
              <path className="auth-model-roof" d="M197 264 353 174 527 263 369 354Z" />
              <path d="M220 299 353 222 502 298" />
              <path d="M220 338 353 261 502 337" />
              <path d="M220 377 353 300 502 376" />
              <path d="M252 233 252 393M306 202 306 363M407 202 407 363M469 233 469 394" />
              <path className="auth-model-accent" d="M353 174 353 335 527 424" />
              <path className="auth-model-accent" d="M306 363 369 396 407 375" />
            </g>
          </svg>
          <div className="auth-model-status">
            <span><i /> {t("c.models")}</span>
            <strong>94%</strong>
            <small>{t("c.modelsDetail")}</small>
          </div>
          <div className="auth-model-tag">DWG · BIM · 3D</div>
        </div>

        <div className="auth-flow" aria-label={t("c.workspaceFlow")}>
          <div><Layers3 aria-hidden="true" /><span><strong>{t("c.plans")}</strong><small>{t("c.plansDetail")}</small></span></div>
          <div><Boxes aria-hidden="true" /><span><strong>{t("c.models")}</strong><small>{t("c.modelsDetail")}</small></span></div>
          <div><Users aria-hidden="true" /><span><strong>{t("c.team")}</strong><small>{t("c.teamDetail")}</small></span></div>
        </div>
      </aside>
    </main>
  );
}
