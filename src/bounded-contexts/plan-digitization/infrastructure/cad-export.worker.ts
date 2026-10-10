import type { CadPlan } from "../domain/entities/cad-plan";

/** DWG writing runs away from React; exported entities use the edited drawing coordinates. */
self.onmessage = async (event: MessageEvent<CadPlan>) => {
  try {
    const url = "/vendor/plan-tools/acad.bundle.js";
    const cad = (await import(
      /* webpackIgnore: true */ url
    )) as typeof import("@node-projects/acad-ts");
    const document = new cad.CadDocument();
    document.header!.version = cad.ACadVersion.AC1032;
    document.header!.insUnits =
      event.data.metersPerCadUnit === 0.001
        ? 4
        : event.data.metersPerCadUnit === 0.01
          ? 5
          : event.data.metersPerCadUnit === 0.3048
            ? 2
            : 6;
    const layers = new Map(
      event.data.layers.map((l) => {
        const layer =
          l.name === "0" ? document.layers!.get("0")! : new cad.Layer(l.name);
        layer.isOn = l.visible;
        if (l.name !== "0") document.layers!.add(layer);
        return [l.name, layer] as const;
      }),
    );
    for (const e of event.data.entities) {
      let entity:
        | InstanceType<typeof cad.Line>
        | InstanceType<typeof cad.LwPolyline>
        | InstanceType<typeof cad.Circle>
        | InstanceType<typeof cad.TextEntity>;
      if (e.kind === "path") {
        if (e.points.length === 4 && !e.closed) {
          const line = new cad.Line();
          line.startPoint = new cad.XYZ(e.points[0], e.points[1], 0);
          line.endPoint = new cad.XYZ(e.points[2], e.points[3], 0);
          entity = line;
        } else {
          const line = new cad.LwPolyline(
            e.points.flatMap((x, i) =>
              i % 2 ? [] : [new cad.XY(x, e.points[i + 1])],
            ),
          );
          line.isClosed = e.closed;
          entity = line;
        }
      } else if (e.kind === "circle") {
        const circle = new cad.Circle();
        circle.center = new cad.XYZ(e.x, e.y, 0);
        circle.radius = e.radius;
        entity = circle;
      } else {
        const text = new cad.TextEntity(e.value);
        text.insertPoint = new cad.XYZ(e.x, e.y, 0);
        text.height = e.height;
        text.rotation = e.rotation;
        entity = text;
      }
      const layer = layers.get(e.layer);
      if (layer) entity.layer = layer;
      const color = e.color.startsWith("#")
        ? e.color
            .slice(1)
            .match(/../g)
            ?.map((s) => parseInt(s, 16))
        : e.color.match(/\d+/g)?.map(Number);
      if (color?.length === 3)
        entity.color = new cad.Color(color[0], color[1], color[2]);
      document.modelSpace!.entities.add(entity);
    }
    const bytes = cad.DwgWriter.writeToBuffer(document);
    (self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
      { bytes },
      [bytes.buffer],
    );
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
