"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useEffect,
  useRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { X } from "lucide-react";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Shared presentation primitives keep labels, focus behavior and loading structure consistent. */
export function WorkspaceSkeleton() {
  return (
    <div className="pm-skeleton" role="status" aria-label="Loading workspace">
      <div />
      <div />
      <div className="pm-skeleton-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} />
        ))}
      </div>
      <div className="pm-skeleton-content" />
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className={"pm-status pm-status-" + value}>
      {t("pm.status." + value, value)}
    </span>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="pm-card pm-metric">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="pm-card pm-empty">
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <label className="pm-field">
      <span id={labelId}>{label}</span>
      {Children.map(children, (child) =>
        isValidElement(child) &&
        typeof child.type === "string" &&
        ["input", "select", "textarea"].includes(child.type)
          ? cloneElement(
              child as ReactElement<{ "aria-labelledby"?: string }>,
              { "aria-labelledby": labelId },
            )
          : child,
      )}
    </label>
  );
}
/** Native dialog provides modal focus trapping, escape dismissal and focus restoration. */
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pm-dialog"
      aria-label={title}
      onCancel={onClose}
    >
      <div className="pm-dialog-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="pm-icon-button"
          onClick={onClose}
          aria-label={t("pm.close")}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function money(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
export function dateLabel(value: string, locale: string) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value + "T12:00:00Z"))
    : "—";
}
