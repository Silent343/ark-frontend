# Auditoría y preparación de anotaciones CAD

Este flujo prepara evidencia local para seleccionar/entrenar y evaluar un detector. No convierte DWG en ground truth, no entrena una red y no certifica un BIM.

## Ejecutar

Desde el repositorio frontend, con las dependencias instaladas:

```powershell
npm run audit:corpus -- --source 'C:\planos\arquitectura' --source 'C:\planos\estructuras.dwg' --source 'C:\planos\sanitarias' --out '.data/corpus/mi-lote-v1'
npm run prepare:review -- --audit '.data/corpus/mi-lote-v1'
npm run test:corpus
npm run test:corpus:browser
```

La carpeta de salida debe ser nueva y estar dentro de `.data/`, ignorado por Git. El flujo no sube planos, vectores, anotaciones ni pesos a servicios externos. Para enviar el lote a un profesional, hacerlo expresamente y con autorización de los autores.

Para preparar una nueva versión sin sobreescribir anotaciones, añadir `--out '.data/corpus/mi-lote-v1/review-v2'` a `prepare:review`. Si el usuario confirma agrupación y permiso de entrenamiento, se registra en `context.json` junto a `audit.json` con `schemaVersion: 1`, `sourceGroup` (identificador estable del edificio), `buildingGroupConfirmedBy: "user"` y `permissions.training: "user-attested"`. Esto conserva el origen de su declaración; no acredita contratos, uso comercial o validación arquitectónica. El generador incorpora el grupo, pero conserva todos sus recortes en `split: "unassigned"` y nunca declara el lote listo para entrenar.

## Evidencia generada

- `inventory.json`: archivos seleccionados y SHA-256; deduplicación por contenido, sin asumir que cada archivo es un edificio.
- `audit.json` e `INFORME.md`: capas, bloques, unidades declaradas, geometría antes/después de resolver referencias, espacios modelo/papel, omisiones y límites del extractor.
- `layer-review.csv`: clasificación propuesta y campos vacíos para clasificación aprobada, anotador, revisor y notas. El número de primitivas no equivale al número de elementos arquitectónicos.
- `*.vectors.json`: geometría 2D del extractor real de la aplicación, manteniendo capas y bloques. No incluye todas las entidades DWG: consultar `skipped`.
- `review-batch.json` y `revision.html`: recortes propuestos para arquitectura, mobiliario, carpinterías, estructuras, agua, desagüe y detalles sanitarios cuando sus fuentes están disponibles.

Cada DWG se procesa en un proceso aislado con límite de memoria/tiempo. Solo se resuelven referencias entre archivos explícitamente seleccionados. Los nombres de referencia se comparan por basename normalizado; si hay dos contenidos distintos con el mismo nombre, la resolución queda pendiente, no se elige uno arbitrariamente. No se siguen rutas remotas o rutas incrustadas en el plano.

Los encabezados INSUNITS son evidencia declarada, nunca calibración validada. Una discrepancia entre unidades de lámina y referencia requiere comprobar la transformación de inserción y cotas reales; no multiplicar coordenadas ciegamente por el encabezado.

## Revisión profesional

Abrir `revision.html` en un navegador. Es una herramienta offline separada del editor principal de Ark, no una nueva pantalla desplegada de la aplicación.

1. Verificar que el recorte corresponde a una planta, corte, elevación, detalle o leyenda; el generador todavía no garantiza esa separación. Los bloques de una lámina pueden ser vistas repetidas, símbolos de leyenda o elementos reales.
2. Comprobar límites, escala y una cota conocida. La vista muestra solo geometría del recorte; si falta contexto, volver al CAD original y preparar otro recorte. Si la vista alcanzó el límite de 6000 primitivas, no tratarla como completa.
3. Corregir o eliminar propuestas; añadir omisiones. Usar cajas para símbolos, polígonos para huellas y polilíneas para trazados. Una red no queda descrita profesionalmente con una única caja.
4. Descargar el borrador JSON antes de cerrar. Se puede volver a cargar en el mismo HTML; se comprueban identidad de fuente, recorte y clases. La herramienta mantiene `reviewed: false` y `trainingReady: false`, aunque se introduzca el nombre de un revisor: escribir un nombre no acredita una revisión.
5. Un arquitecto/ingeniero independiente debe revisar geometría, clases, negativos y omisiones en el original. Confirmar derechos, edificio, niveles, vistas y anotaciones exhaustivas. Esta aprobación y su trazabilidad todavía deben incorporarse mediante un paso de adjudicación; este lote no exporta certificados ni cambia automáticamente esos indicadores.

El formulario permite anotar, pero no valida pendientes hidráulicas, diámetro, conectividad de una red, materiales, cálculo estructural, cotas verticales o cumplimiento normativo. Tampoco proporciona edición de vértices: una geometría incorrecta se elimina y se vuelve a dibujar.

## Qué se puede concluir

Una capa llamada `MURO` o un bloque llamado `SILLA` es una pista, no una anotación independiente. El auditor solo propone clases por reglas conservadoras de nombres; no intenta demostrar capacidad de aprendizaje con esas mismas reglas. Los nombres anónimos y códigos de accesorios requieren consultar leyendas y al profesional.

La selección inicial incluye vocabulario de vigas, viguetas, cimentaciones, válvulas y sumideros. Parte de estas clases todavía no está representada en el evaluador/modelo 3D de Ark; mantenerlas separadas y ampliar los contratos, familias y métricas antes de introducirlas al entrenamiento de producción. No remapear todo a `wall` o `equipment` para aparentar cobertura.

Para entrenamiento, faltan adjudicación independiente, rasterización/calibración congelada, exportación COCO/máscaras coherente con la arquitectura elegida y separación por edificio. Un solo edificio, aunque aporte decenas de láminas y disciplinas, no permite demostrar generalización. No separar sus plantas, cortes, recortes y revisiones entre train/validation/test. Después se evalúan predicciones congeladas con los protocolos de `detector-evaluation-and-correspondence.md`; ni los borradores CAD ni las cajas en coordenadas `cad-xy-y-up` pueden pasarse directamente al evaluador métrico `project-xy`.

## Pruebas

`test:corpus` comprueba reglas conservadoras, unidades sin confirmar, referencias ambiguas, propuestas no certificadas, recortes privados y protección contra sobreescritura. `test:corpus:browser` usa un contexto Chrome headless aislado con datos sintéticos, sin API de proyectos, y comprueba dibujo, redes, exportación/importación y rechazo de un borrador de otra fuente. Se puede pasar `--html .data/corpus/mi-lote-v1/revision.html` para probar un lote real; las anotaciones de QA se guardan como `browser-qa-draft.json`, nunca como referencia arquitectónica.
