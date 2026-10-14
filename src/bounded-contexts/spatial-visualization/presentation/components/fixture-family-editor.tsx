"use client";
import { useState } from "react";
import type { Blueprint } from "@/bounded-contexts/plan-digitization";
import {
  FIXTURE_FAMILIES,
  familyForFixture,
  validFamilyAssignment,
  type FixtureFamilyAssignment,
} from "@/bounded-contexts/plan-digitization/domain/fixture-families";

export function FixtureFamilyEditor({
  fixture,
  plan,
  onSave,
}: {
  fixture: NonNullable<Blueprint["fixtures"]>[number];
  plan: Blueprint;
  onSave?: (
    ids: string[],
    assignment: FixtureFamilyAssignment | undefined,
  ) => Promise<void>;
}) {
  const current = plan.fixtureFamilies?.[fixture.id];
  const family = familyForFixture(fixture, plan.fixtureFamilies);
  const suggested = familyForFixture(fixture);
  const options = FIXTURE_FAMILIES.filter((f) => f.kind === fixture.kind);
  const peers = (plan.fixtures ?? []).filter(
    (f) => f.kind === fixture.kind && f.levelId === fixture.levelId,
  );
  const [familyId, setFamilyId] = useState(current?.familyId ?? "");
  const [finish, setFinish] = useState<FixtureFamilyAssignment["finish"]>(
    current?.finish ?? "natural",
  );
  const [elevation, setElevation] = useState(String(current?.elevationM ?? 0));
  const [repeat, setRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  if (!options.length)
    return (
      <p className="model-inspector-help">
        Asigna un tipo al objeto en el plano 2D para elegir su familia.
      </p>
    );
  return (
    <form
      className="model-family-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!onSave || busy) return;
        const selection = familyId
          ? { familyId, finish, elevationM: Number(elevation) }
          : undefined;
        if (
          selection &&
          (!validFamilyAssignment(selection) ||
            !options.some((f) => f.id === familyId) ||
            elevation.trim() === "")
        ) {
          setError(
            "Selecciona una familia compatible y una elevación entre 0 y 10 m.",
          );
          return;
        }
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          await onSave(
            repeat ? peers.map((f) => f.id) : [fixture.id],
            selection as FixtureFamilyAssignment | undefined,
          );
          setSaved(true);
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudo guardar la familia.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4>Familia 3D</h4>
      <p>
        La representación conserva las medidas del elemento. Elegir un tipo o
        acabado no confirma su detección.
      </p>
      <label>
        Tipo de representación
        <select
          aria-label="Familia 3D"
          value={familyId}
          disabled={!onSave || busy}
          onChange={(e) => {
            setFamilyId(e.target.value as typeof familyId);
            setSaved(false);
          }}
        >
          <option value="">Sugerida · {suggested?.label}</option>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {!!familyId && (
        <>
          <label>
            Acabado
            <select
              aria-label="Acabado de la familia"
              value={finish}
              disabled={!onSave || busy}
              onChange={(e) => {
                setFinish(e.target.value as typeof finish);
                setSaved(false);
              }}
            >
              <option value="natural">Material original de la familia</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
          <label>
            Elevación sobre el nivel (m)
            <input
              aria-label="Elevación de la familia"
              type="number"
              min="0"
              max="10"
              step="0.01"
              required
              value={elevation}
              disabled={!onSave || busy}
              onChange={(e) => {
                setElevation(e.target.value);
                setSaved(false);
              }}
            />
          </label>
        </>
      )}
      <small>
        {current
          ? "Tipo elegido manualmente"
          : "Representación sugerida por categoría y nombre"}
        : {family?.label}
      </small>
      {onSave && (
        <>
          {peers.length > 1 && (
            <label className="model-family-repeat">
              <input
                type="checkbox"
                checked={repeat}
                disabled={busy}
                onChange={(e) => setRepeat(e.target.checked)}
              />
              Aplicar a {peers.length} objetos del mismo tipo y nivel
            </label>
          )}
          <button
            type="submit"
            className="pm-button pm-primary"
            disabled={busy}
          >
            {busy ? "Guardando…" : "Guardar representación"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Representación guardada.</p>}
    </form>
  );
}
