"use client";

import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";

const MAX_COVER_SIZE = 2 * 1024 * 1024;
const COVER_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ProjectCoverFieldProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** Converts a validated local cover into a portable data URL owned by the project aggregate. */
function readCover(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Project cover could not be read."));
    reader.readAsDataURL(file);
  });
}

/** Shared accessible cover picker used by both project creation and editing flows. */
export function ProjectCoverField({
  value,
  disabled = false,
  onChange,
}: ProjectCoverFieldProps) {
  const { t } = useI18n();
  const [error, setError] = useState("");

  const select = async (file?: File) => {
    if (!file || disabled) return;
    if (!COVER_TYPES.includes(file.type) || file.size > MAX_COVER_SIZE) {
      setError(t("pm.coverError"));
      return;
    }
    try {
      onChange(await readCover(file));
      setError("");
    } catch {
      setError(t("pm.coverReadError"));
    }
  };

  return (
    <section className="pm-cover-field">
      <div>
        <strong>{t("pm.cover")}</strong>
        <p>{t("pm.coverHelp")}</p>
      </div>
      <div className="pm-cover-picker">
        <div className="pm-cover-preview">
          {value ? (
            // A data URL is intentionally rendered directly; it has already passed REST validation.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={t("pm.coverPreviewAlt")} />
          ) : (
            <span>
              <ImagePlus size={24} />
              {t("pm.defaultCover")}
            </span>
          )}
        </div>
        <div className="pm-cover-actions">
          <label className="pm-button pm-small">
            <input
              className="sr-only"
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              disabled={disabled}
              onChange={(event) => {
                void select(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            {value ? <RefreshCw size={14} /> : <ImagePlus size={14} />}
            {t(value ? "pm.coverReplace" : "pm.coverUpload")}
          </label>
          {value && (
            <button
              type="button"
              className="pm-button pm-small"
              disabled={disabled}
              onClick={() => {
                onChange("");
                setError("");
              }}
            >
              <Trash2 size={14} />
              {t("pm.coverRemove")}
            </button>
          )}
          {error && (
            <small className="pm-cover-error" role="alert">
              {error}
            </small>
          )}
        </div>
      </div>
    </section>
  );
}
