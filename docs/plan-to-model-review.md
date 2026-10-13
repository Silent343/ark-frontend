# Plano → modelo: revisión trazable

La fase posterior, con reconstrucción v5, correspondencias de cotas entre vistas y evaluación reproducible del detector, se documenta en [Detección evaluable y correspondencia entre vistas](detector-evaluation-and-correspondence.md). Este documento conserva el alcance y las comprobaciones de la etapa v4.

## Alcance de esta actualización

Se aplica la separación entre evidencia documental, interpretación geométrica y presentación descrita en la investigación de Ark del 13 de octubre de 2026. Esta implementación sigue siendo heurística: no incorpora un detector neuronal entrenado ni certifica un modelo BIM.

### Entrada progresiva

- El alta requiere nombre; ubicación y documentos son opcionales.
- La finalidad se conserva en `Blueprint.intent`; no implica exportación IFC disponible.
- Suelo y sistema estructural quedan «Por definir»: no se inventan a partir de la imagen ni se piden para visualizar un plano.
- Se admite un CAD editable principal y referencias PDF/imagen. No hay federación automática de varios DWG.
- Las referencias se clasifican por disciplina y contenido. El asistente conserva la disciplina y evita analizar cortes/elevaciones como plantas, salvo que el usuario corrija explícitamente su clasificación.
- Un fallo de inicialización conserva el ID creado y permite continuar sin volver a crear el proyecto. Los documentos ya subidos no se repiten al reintentar en la misma pantalla.

### Reconstrucción v4

- `CadRegion.wallHeight`: altura de muros confirmada manualmente, en metros.
- `CadRegion.elevationSource`: procedencia de las cotas de nivel (`annotation` o `manual`).
- `CadRegion.alignment`: corrección X/Y en metros, relativa a la alineación automática; no son coordenadas de la lámina.
- Se preservan alturas superiores a seis metros. El desnivel entre pisos sigue separado de la altura manual de los muros al generar columnas y escaleras.
- Los huecos se acotan a la altura de su muro anfitrión; símbolos incompatibles permanecen pendientes en vez de generar sólidos invertidos.
- Las caras de muro fusionadas conservan los IDs originales. Cada objeto generado registra región, archivo, método y propiedades asumidas en `elementEvidence`.
- Las referencias de losas, columnas y tramos de escalera pueden ser regionales, no correspondencias individuales exactas. La interfaz las denomina entidades de referencia.
- `heightSource: levels` indica una derivación entre cotas, no una altura libre confirmada. El inspector mantiene la revisión pendiente.

### Interacción y rendimiento

El estudio 3D presenta selección, dimensiones y acceso al CAD de origen. Muros, aberturas, columnas, peldaños y mobiliario mantienen lotes instanciados; seleccionar cambia colores sin desagregar los lotes. Losas y cubiertas fusionadas conservan rangos de triángulos para seleccionar su objeto sin una malla por cara. La actualización de color no se ejecuta por fotograma de órbita.

No se ha medido aún una mejora de FPS en una batería representativa de equipos. Se conservan las políticas existentes de resolución adaptativa y sombras bajo demanda.

### Validación y límites

Frontend y backend verifican referencias a elementos, entidades CAD y regiones existentes, métodos permitidos, propiedades asumidas, alturas y desplazamientos finitos y límites de tamaño. Las pruebas cubren procedencia fusionada, alturas de auditorio, prioridad de edición manual, corrección métrica y rechazo de referencias inventadas.

La revisión del modelo identifica muros degenerados, anfitriones ausentes o de otro nivel, aberturas fuera del volumen del muro y huecos superpuestos. Estos conflictos son diagnósticos de borrador: no equivalen a una revisión normativa ni prueban que la extracción corresponda al edificio real.

### Comprobación con archivos suministrados

Prueba local de la reconstrucción v4, 13 de octubre de 2026:

| Archivo   | Niveles interpretados | Muros | Mobiliario/equipo propuesto | Objetos con referencia CAD |
| --------- | --------------------: | ----: | --------------------------: | -------------------------: |
| rt02.dwg  |                     1 |   117 |                         141 |                        276 |
| cs06.dwg  |                     3 |   201 |                          37 |                        284 |
| au_04.dwg |                     1 |    94 |                         238 |                        355 |

Las referencias resultaron resolubles y los controles geométricos implementados no encontraron conflictos en esos tres resultados. Las alturas de todos sus niveles siguen pendientes de confirmación. Estos conteos **no son métricas de exactitud, cobertura ni reconocimiento correcto**: todavía no existe una anotación independiente del edificio para calcularlas.

Pendiente para una siguiente fase: corpus anotado y métricas por clase, detección neuronal evaluada fuera de dominio, correspondencia entre cortes/cuadros/plantas, asociación fina de símbolos estructurales, pendientes y superficies complejas, IFC interoperable y validación por arquitectos. Ninguno de estos puntos se considera resuelto por añadir un visor o un inspector.
