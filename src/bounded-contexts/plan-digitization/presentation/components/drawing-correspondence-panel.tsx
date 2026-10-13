"use client";
import { useMemo, useState } from "react";
import type { Blueprint } from "../../domain/entities/blueprint";
import {
  correspondenceTargets,
  dimensionProposals,
  drawingTextSources,
  resolveDrawingCorrespondences,
  targetSignature,
  type DrawingProperty,
} from "../../domain/drawing-coordination";

/** The user resolves document identity; numerical extraction alone cannot establish which opening a row describes. */
export function DrawingCorrespondencePanel({
  plan,
  disabled,
  onSave,
  onFocus,
  onImport,
  initialTargetId,
}: {
  plan: Blueprint;
  disabled?: boolean;
  onSave: (next: Blueprint) => Promise<void>;
  onFocus?: (regionId: string, textId: string) => void;
  onImport?: () => void;
  initialTargetId?: string;
}) {
  const sources = useMemo(() => drawingTextSources(plan), [plan]);
  const targets = useMemo(() => correspondenceTargets(plan), [plan]);
  const resolution = useMemo(() => resolveDrawingCorrespondences(plan), [plan]);
  const [sourceKey, setSourceKey] = useState("");
  const [targetId, setTargetId] = useState(initialTargetId ?? "");
  const [search, setSearch] = useState("");
  const [property, setProperty] = useState<DrawingProperty>("height");
  const [value, setValue] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = (s: (typeof sources)[number]) =>
    `${s.kind}:${s.viewId}:${s.textId}`;
  const source = sources.find((s) => key(s) === sourceKey);
  const destinationEvidence = plan.elementEvidence?.[targetId];
  const filtered = targets.filter((t) =>
    `${t.label} ${t.id} ${plan.levels.find((l) => l.id === t.levelId)?.name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const proposal = source ? dimensionProposals(source.text) : [];
  const numericValue = Number(value.replace(",", "."));
  const validValue =
    !!value.trim() &&
    Number.isFinite(numericValue) &&
    numericValue <= 100 &&
    (numericValue > 0 || (property === "sillHeight" && numericValue === 0));
  const unitConfirmed = plan.cad ? plan.cad.unitConfirmed : !!plan.calibration;
  async function persist(next: Blueprint) {
    setBusy(true);
    setError("");
    try {
      await onSave(next);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  function add() {
    const signature = targetSignature(plan, targetId),
      n = Number(value.replace(",", "."));
    if (
      !source ||
      !signature ||
      !confirmed ||
      !value.trim() ||
      !Number.isFinite(n) ||
      n > 100 ||
      n < 0 ||
      (n === 0 && property === "height")
    )
      return;
    void persist({
      ...plan,
      correspondences: [
        ...(plan.correspondences ?? []),
        {
          id: crypto.randomUUID(),
          source: {
            kind: source.kind,
            viewId: source.viewId,
            textId: source.textId,
            signature: source.signature,
          },
          targetId,
          targetSignature: signature,
          property,
          valueM: n,
          quote: source.text,
          confirmedAt: new Date().toISOString(),
        },
      ],
    });
  }
  return (
    <section
      className="drawing-coordination-panel"
      aria-label="Correspondencia entre vistas"
    >
      <h2>Vincular vistas</h2>
      <p>
        Relaciona una cota de un corte, elevación o cuadro con el elemento que
        describe en la planta.
      </p>
      {onImport && (
        <button
          type="button"
          className="pm-button"
          disabled={disabled || busy}
          onClick={onImport}
        >
          Añadir corte o cuadro
        </button>
      )}
      {!sources.length && (
        <p>
          Clasifica una región CAD como corte o cuadro en «Vistas», o añade una
          referencia con texto. En imágenes puedes activar la lectura OCR al
          importar.
        </p>
      )}
      {!!sources.length && (
        <fieldset disabled={disabled || busy}>
          <label>
            Texto de origen
            <select
              value={sourceKey}
              onChange={(e) => {
                setSourceKey(e.target.value);
                setConfirmed(false);
                setValue("");
              }}
            >
              <option value="">Selecciona la cota o fila del cuadro</option>
              {sources.slice(0, 1000).map((s) => (
                <option key={key(s)} value={key(s)}>
                  {s.label} · {s.text}
                </option>
              ))}
            </select>
          </label>
          {sources.length > 1000 && (
            <small>
              Se muestran los primeros 1000 textos. Delimita la región de
              referencia para reducir el alcance.
            </small>
          )}
          {source && (
            <>
              <blockquote>{source.text}</blockquote>
              {source.kind === "cad" && onFocus && (
                <button
                  type="button"
                  className="pm-button"
                  onClick={() => onFocus(source.viewId, source.textId)}
                >
                  Ver cota en el CAD
                </button>
              )}
              {source.kind === "sheet" &&
                (() => {
                  const sheet = plan.sheets?.find(
                    (s) => s.id === source.viewId,
                  );
                  return sheet ? (
                    <details className="drawing-reference-preview">
                      <summary>Ver lámina · página {sheet.page}</summary>
                      {/* Local document previews already contain their raster; no image optimizer/network roundtrip is needed. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sheet.image}
                        alt={`Referencia ${sheet.name}, página ${sheet.page}`}
                      />
                      <a
                        href={sheet.image}
                        download={`${sheet.sourceName}-p${sheet.page}.jpg`}
                      >
                        Descargar vista para revisarla
                      </a>
                    </details>
                  ) : null;
                })()}
              <label>
                Buscar elemento de destino
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Muro, ventana, nivel o ID"
                />
              </label>
              <label>
                Elemento en planta
                <select
                  value={targetId}
                  onChange={(e) => {
                    setTargetId(e.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">
                    Selecciona el elemento que corresponde
                  </option>
                  {filtered.slice(0, 300).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ·{" "}
                      {plan.levels.find((l) => l.id === t.levelId)?.name} ·{" "}
                      {t.id}
                    </option>
                  ))}
                </select>
              </label>
              {filtered.length > 300 && (
                <small>
                  Filtra para encontrar otros elementos ({filtered.length}{" "}
                  resultados).
                </small>
              )}
              {destinationEvidence?.sourceIds[0] && onFocus && (
                <button
                  type="button"
                  className="pm-button"
                  onClick={() =>
                    onFocus(
                      destinationEvidence.regionId,
                      destinationEvidence.sourceIds[0],
                    )
                  }
                >
                  Ver elemento en planta
                </button>
              )}
              <label>
                Medida
                <select
                  value={property}
                  onChange={(e) => {
                    setProperty(e.target.value as DrawingProperty);
                    setConfirmed(false);
                  }}
                >
                  <option value="height">Altura del elemento</option>
                  <option value="sillHeight">Antepecho de ventana</option>
                </select>
              </label>
              {!!proposal.length && (
                <div className="drawing-proposals">
                  {proposal.map((p, i) => (
                    <button
                      type="button"
                      className="pm-button"
                      key={i}
                      onClick={() => {
                        setProperty(p.property);
                        setValue(String(p.valueM));
                        setConfirmed(false);
                      }}
                    >
                      Usar {p.property === "height" ? "altura" : "antepecho"}:{" "}
                      {p.valueM} m
                    </button>
                  ))}
                </div>
              )}
              <label>
                Valor leído (m)
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label className="drawing-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                He verificado la medida, el nivel y el elemento de destino.
              </label>
              {!unitConfirmed && (
                <p>
                  Confirma primero las unidades del plano para aplicar esta
                  medida.
                </p>
              )}
              <button
                type="button"
                className="pm-button pm-primary"
                disabled={
                  !confirmed ||
                  !targetId ||
                  !validValue ||
                  !unitConfirmed ||
                  (plan.correspondences?.length ?? 0) >= 2000
                }
                onClick={add}
              >
                Confirmar correspondencia
              </button>
            </>
          )}
        </fieldset>
      )}
      {!!plan.correspondences?.length && (
        <div className="drawing-correspondences">
          <h3>Correspondencias guardadas</h3>
          {plan.correspondences.map((r) => {
            const state = resolution.results.find((s) => s.id === r.id);
            return (
              <article key={r.id} data-state={state?.status}>
                <strong>
                  {targets.find((t) => t.id === r.targetId)?.label ??
                    r.targetId}{" "}
                  · {r.property === "height" ? "altura" : "antepecho"}{" "}
                  {r.valueM} m
                </strong>
                <blockquote>{r.quote}</blockquote>
                <small>{state?.detail}</small>
                <button
                  type="button"
                  className="pm-button"
                  disabled={disabled || busy}
                  onClick={() =>
                    void persist({
                      ...plan,
                      correspondences: plan.correspondences!.filter(
                        (c) => c.id !== r.id,
                      ),
                    })
                  }
                >
                  Retirar vínculo
                </button>
              </article>
            );
          })}
        </div>
      )}
      {disabled && (
        <p role="status">
          Espera a que se guarden los cambios del plano antes de vincular
          medidas.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
