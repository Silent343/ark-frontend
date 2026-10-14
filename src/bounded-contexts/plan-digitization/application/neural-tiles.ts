import { rasterTiles, type RasterTile } from "./raster-tiles";
import type { CadPlan, CadRegion } from "../domain/entities/cad-plan";
export function neuralTiles(
  cad: CadPlan,
  region: CadRegion,
  metersPerPixel: number,
): RasterTile[] {
  if (
    !cad.unitConfirmed ||
    !Number.isFinite(cad.metersPerCadUnit) ||
    cad.metersPerCadUnit <= 0
  )
    throw new Error("Confirma las unidades antes del análisis neuronal.");
  if (
    !Number.isFinite(metersPerPixel) ||
    metersPerPixel < 0.005 ||
    metersPerPixel > 0.1
  )
    throw new Error("El detalle debe estar entre 0,5 y 10 cm por píxel.");
  const width = Math.ceil(
      ((region.maxX - region.minX) * cad.metersPerCadUnit) / metersPerPixel,
    ),
    height = Math.ceil(
      ((region.maxY - region.minY) * cad.metersPerCadUnit) / metersPerPixel,
    );
  const count =
    (Math.ceil(Math.max(0, width - 512) / 409) + 1) *
    (Math.ceil(Math.max(0, height - 512) / 409) + 1);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    count > 128
  )
    throw new Error(
      "La planta necesita demasiados recortes. Delimita una región menor o elige un detalle menos fino.",
    );
  return [...rasterTiles(width, height, 512, 0.2)];
}
export function neuralTileView(
  cad: CadPlan,
  region: CadRegion,
  tile: RasterTile,
  metersPerPixel: number,
) {
  const scale = cad.metersPerCadUnit / metersPerPixel;
  return {
    x: -region.minX * scale - tile.x,
    y: region.maxY * scale - tile.y,
    scale,
    width: 512,
    height: 512,
  };
}
