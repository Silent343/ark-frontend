"use client";
import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { requestJson } from "@/shared/infrastructure/rest-client";
import { recognizeRasterImage } from "../../infrastructure/recognize-raster-image";
import { preserveReviewedSymbols, type RasterNeuralProposal } from "../../domain/raster-neural";
import { NEURAL_CLASS_LABELS } from "../../domain/neural-contract";
import { SPACE_LABELS } from "../../domain/neural-spaces";
import {SymbolReview} from './symbol-review';
import {SYMBOL_KINDS,SYMBOL_LABELS} from '../../domain/symbol-detection';

type Model = {
  id: string;
  label: string;
  classes: string[];
  available: boolean;
  candidate?: boolean;
};
type ObjectModel={id:string;label:string;candidate:boolean;classes:string[]};
export function RasterNeuralPanel({
  canvas,
  projectId,
  proposal,
  onResult,
  onBusy,
  disabled,
}: {
  canvas: HTMLCanvasElement;
  projectId: string;
  proposal: RasterNeuralProposal | null;
  onResult: (result: RasterNeuralProposal) => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [models, setModels] = useState<Model[]>([]),
    [modelId, setModelId] = useState(""),
    [defaultModelId,setDefaultModelId]=useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const chosenModelId=modelId||(models.some(m=>m.id===proposal?.model.id&&m.available)?proposal!.model.id:defaultModelId);
  const [symbolsAvailable,setSymbolsAvailable]=useState(false),[includeSymbols,setIncludeSymbols]=useState(false);
  const [symbolLabel,setSymbolLabel]=useState('');
  const [objectModels,setObjectModels]=useState<ObjectModel[]>([]),[objectModelId,setObjectModelId]=useState(''),[defaultObjectModelId,setDefaultObjectModelId]=useState('');
  // Source hydration is asynchronous. Derive the initial choice from the loaded
  // proposal, while preserving a subsequent explicit user choice.
  const chosenObjectModelId=objectModelId||(objectModels.some(m=>m.id===proposal?.symbols?.model.id)?proposal!.symbols!.model.id:defaultObjectModelId);
  const [candidate,setCandidate]=useState<{images:number;epochs:number;matched:number;total:number;falsePositives:number}|undefined>();
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson<{ models: Model[];symbols?:{available:boolean;id?:string;models?:ObjectModel[];label?:string;candidate?:{images:number;epochs:number;matched:number;total:number;falsePositives:number}} }>(
      `/api/v1/projects/${projectId}/plan-detection`,
      { signal: controller.signal },
    )
      .then((status) => {
        if (controller.signal.aborted) return;
        setModels(status.models);
        setSymbolsAvailable(status.symbols?.available??false);
        setIncludeSymbols(status.symbols?.available??false);
        setSymbolLabel(status.symbols?.label??'');
        setObjectModels(status.symbols?.models??[]);setDefaultObjectModelId(status.symbols?.id??'');
        setCandidate(status.symbols?.candidate);
        setDefaultModelId(
          status.models.find(
            (m) => m.available && m.id === "cubicasa-multitask-v1",
          )?.id ??
            status.models.find((m) => m.available)?.id ??
            "",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, [projectId]);
  async function detect() {
    // The parent only supplies a proposal when its prepared canvas is identical.
    // Keep reviewed objects when comparing architecture models on that source.
    const previous = proposal;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    onBusy(true);
    setError("");
    const timeout = setTimeout(() => controller.abort(), 150_000);
    try {
      const result = await recognizeRasterImage(
        canvas,
        projectId,
        chosenModelId,
        controller.signal,
        includeSymbols,
        chosenObjectModelId||undefined,
      );
      if (!controller.signal.aborted) onResult(preserveReviewedSymbols(result, previous, !includeSymbols));
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Falló el reconocimiento.");
    } finally {
      clearTimeout(timeout);
      if (operation.current === controller) {
        setBusy(false);
        onBusy(false);
        operation.current = null;
      }
    }
  }
  const categories = proposal?.model.classes
    .filter((c) => c !== "background")
    .map((kind) => ({
      kind,
      count:
        kind === "wall"
          ? proposal.walls.length
          : proposal.instances.filter((i) => i.kind === kind).length,
    }));
  return (
    <section
      className="raster-neural-panel"
      aria-label="Reconocimiento neuronal de la imagen"
    >
      <div className="raster-neural-heading">
        <ScanLine size={20} />
        <div>
          <h3>Reconocer elementos con IA</h3>
          <p>Primero detecta. Después indica una medida para preparar el 3D.</p>
        </div>
      </div>
      <div className="raster-neural-actions">
        <label>
          Modelo disponible
          <select
            value={chosenModelId}
            disabled={busy || disabled}
            onChange={(e) => setModelId(e.target.value)}
          >
            {!chosenModelId && <option value="">No hay modelos instalados</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.label}
                {!m.available ? " · no instalado" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="pm-button pm-primary"
          disabled={disabled || busy || !chosenModelId}
          onClick={() => void detect()}
        >
          {busy
            ? "Analizando imagen…"
            : proposal
              ? "Volver a detectar"
              : "Detectar elementos con IA"}
        </button>
        {busy && (
          <button
            type="button"
            className="pm-button"
            onClick={() => operation.current?.abort()}
          >
            Cancelar
          </button>
        )}
      </div>
      <p className="raster-neural-note">
        Pesos experimentales locales. Las categorías que no conoce el modelo
        todavía necesitan entrenamiento propio.
      </p>
      {models.find(m=>m.id===chosenModelId)?.candidate&&<p role="status">{chosenModelId==='ark-architecture-pilot-v2'?'Candidato de suelos: ajuste de espacios conservando el detector de aberturas del piloto.':'Piloto de aberturas: ajuste de puertas y ventanas conservando la segmentación base de espacios.'} Máscaras provisionales; no sustituye automáticamente al modelo anterior ni constituye una validación arquitectónica.</p>}
      {proposal?.model.training&&<p>Arquitectura entrenada con {proposal.model.training.images} muestras derivadas · {proposal.model.training.epochs} épocas. Etiquetas provisionales; los recortes de una misma vivienda no son edificios independientes.</p>}
      {proposal?.model.training?.openingEpochs&&<p>Este ajuste entrena espacios; conserva la rama de aberturas de {proposal.model.training.openingEpochs} épocas anteriores.</p>}
      <label className="symbol-detector-toggle"><input type="checkbox" checked={includeSymbols} disabled={!symbolsAvailable||busy||disabled} onChange={e=>setIncludeSymbols(e.target.checked)}/> Incluir detector de muebles, vegetación, escaleras y coches · experimental{!symbolsAvailable?' (no instalado)':''}</label>
      {includeSymbols&&<p>{symbolLabel}. Revisa las propuestas antes de incorporarlas al 3D. Detector experimental, pendiente de evaluación independiente.</p>}
      {!includeSymbols&&proposal?.symbols&&<p>Al repetir solo arquitectura se conserva el mobiliario revisado de esta misma imagen.</p>}
      {includeSymbols&&objectModels.length>1&&<label>Detector de objetos<select aria-label="Detector de objetos" value={chosenObjectModelId} disabled={busy||disabled} onChange={e=>setObjectModelId(e.target.value)}>{objectModels.map(m=><option key={m.id} value={m.id}>{m.candidate?'Candidato · coches y mobiliario (en evaluación)':m.label}</option>)}</select></label>}
      {includeSymbols&&objectModels.find(m=>m.id===chosenObjectModelId)?.candidate&&<p role="status">Candidato experimental seleccionado: incorpora coches, pero presenta regresiones en otros símbolos. Úsalo para comparar y revisa cada propuesta; no es el detector predeterminado.</p>}
      {candidate&&<details><summary>Entrenamiento · candidato en revisión</summary><p>{candidate.images} muestras derivadas · {candidate.epochs} épocas acumuladas. En dos recortes de otro edificio: {candidate.matched}/{candidate.total} objetos con coincidencia de clase y caja; {candidate.falsePositives} falsos positivos. No sustituye al detector predeterminado: todavía presenta regresiones. Etiquetas provisionales, sin validación arquitectónica independiente.</p></details>}
      {error && (
        <p className="pm-alert pm-danger" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p role="status">
          La red está analizando la imagen; después se convertirán sus máscaras
          a contornos.
        </p>
      )}
      {proposal && (
        <>
          <p role="status">
            {proposal.spaces?.length ?? 0} espacios, {proposal.walls.length}{" "}
            segmentos de muro y {proposal.instances.length} regiones de símbolos
            propuestas · {(proposal.elapsedMs / 1000).toFixed(1)} s de
            inferencia.
          </p>
          <div className="raster-neural-categories">
            {Object.entries(SPACE_LABELS)
              .filter(([kind]) => proposal.spaces?.some((s) => s.kind === kind))
              .map(([kind, label]) => (
                <span key={kind}>
                  {label}
                  <b>
                    {proposal.spaces!.filter((s) => s.kind === kind).length}
                  </b>
                </span>
              ))}
            {categories?.map(({ kind, count }) => (
              <span key={kind}>
                {NEURAL_CLASS_LABELS[kind] ?? kind}
                <b>{count}</b>
              </span>
            ))}
          </div>
          {proposal.spaces === undefined && (
            <p role="alert">
              El servidor todavía no entrega la máscara de espacios. Esta
              detección no incluye ambientes.
            </p>
          )}
          {proposal.symbols?<>
            <div className="raster-neural-categories">{SYMBOL_KINDS.map(kind=><span key={kind}>{SYMBOL_LABELS[kind]}<b>{proposal.symbols!.model.classes.includes(kind)?proposal.symbols!.items.filter(i=>i.kind===kind).length:'No soportada'}</b></span>)}</div>
            <SymbolReview canvas={canvas} value={proposal.symbols} disabled={busy||disabled} onChange={symbols=>onResult({...proposal,symbols})}/>
          </>:<p>Esta detección no incluye el detector especializado de mobiliario. No se añaden muebles por el nombre del ambiente.</p>}
          <p>
            La superposición de colores es la salida real del modelo. Los
            recuentos son propuestas, no elementos arquitectónicos verificados.
          </p>
        </>
      )}
    </section>
  );
}
