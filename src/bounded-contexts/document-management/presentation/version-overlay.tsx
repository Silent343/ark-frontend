"use client";
/* eslint-disable @next/next/no-img-element -- User-uploaded document snapshots use validated data URLs. */
import { useState } from "react";
import type { ProjectDocument } from "../index";
import { useI18n } from "@/shared/i18n/presentation/i18n-provider";
/** Linked zoom and blend controls help visually align raster versions without claiming automatic detection. */
export function VersionOverlay({
  left,
  right,
}: {
  left?: ProjectDocument;
  right?: ProjectDocument;
}) {
  const { t } = useI18n();
  const [opacity, setOpacity] = useState(50),
    [zoom, setZoom] = useState(100),
    [difference, setDifference] = useState(false);
  if (
    !left?.file_data ||
    !right?.file_data ||
    !left.mime_type.startsWith("image/") ||
    !right.mime_type.startsWith("image/")
  )
    return null;
  return (
    <div className="collab-overlay">
      <h3>{t("c.overlay")}</h3>
      <div className="pm-actions">
        <label>
          {t("c.opacity")}
          <input
            aria-label={t("c.opacity")}
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
          />
        </label>
        <label>
          Zoom
          <input
            aria-label="Zoom"
            type="range"
            min={50}
            max={200}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label className="collab-checkbox">
          <input
            type="checkbox"
            checked={difference}
            onChange={(e) => setDifference(e.target.checked)}
          />
          {t("c.difference")}
        </label>
      </div>
      <div className="collab-overlay-scroll">
        <div style={{ width: zoom + "%", position: "relative" }}>
          <img src={left.file_data} alt={left.title} />
          <img
            src={right.file_data}
            alt={right.title}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "fill",
              opacity: opacity / 100,
              mixBlendMode: difference ? "difference" : "normal",
            }}
          />
        </div>
      </div>
      <p className="pm-muted">{t("c.overlayHelp")}</p>
    </div>
  );
}
