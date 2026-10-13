# Detección evaluable y correspondencia entre vistas

## Estado de la fase

La reconstrucción CAD pasa a la versión 6. Se implementa correspondencia documental, evaluación reproducible y una propuesta híbrida CAD + segmentación neuronal preentrenada, activada por el usuario. Se seleccionó OpenBIM M2 para experimentación local; no se entrenó un modelo propio ni se obtuvieron métricas de exactitud con anotaciones independientes de los edificios suministrados. Las pruebas sintéticas verifican el software, no su capacidad de reconocer edificios reales. Véase [selección, instalación y límites del detector neuronal](neural-detector.md).

## Flujo para el arquitecto

1. En el editor CAD, «Vistas» permite delimitar y clasificar planta, corte, elevación, cuadro y detalle. Solo una región clasificada como planta y habilitada participa en la extrusión.
2. En «Vincular», se pueden añadir referencias PDF o imagen. Un PDF conserva el texto embebido; una imagen o un PDF escaneado puede utilizar el OCR local ya disponible. Guardar una referencia no requiere inventar una escala ni generar muros.
3. El usuario selecciona una cota/fila, su elemento de destino y el valor en metros. Una expresión explícita como `ALTURA LIBRE = 320 cm` propone 3.2 m. Un número de nivel, escala, número de pisos o una cifra sin unidad no propone alturas.
4. El usuario verifica la identidad del elemento y confirma el vínculo. Se admiten altura de muros, puertas, ventanas y columnas, y antepecho de ventanas. No se deducen coordenadas en planta de un corte ni asociaciones por mera proximidad.
5. El 3D aplica las medidas en un modelo derivado. El resultado bruto del detector permanece disponible para evaluar su comportamiento y para retirar un vínculo sin destruir la geometría original.
6. Si cambia la fuente, la cota, la geometría, el nivel o la escala, el vínculo queda obsoleto. Si varias fuentes asignan valores distintos a la misma propiedad, se bloquean las medidas de ese elemento hasta resolver la discrepancia. Si una modificación hace incompatible una abertura con su anfitrión, se revierte el grupo vinculado en la vista derivada.

La coincidencia de nombres o cotas no prueba por sí sola que dos láminas describan el mismo elemento. Esta primera versión requiere confirmación humana de esa identidad; no presenta una asociación automática como verificada.

## Persistencia y reconstrucción

`Blueprint.correspondences` guarda el origen (`cad`/`sheet`, vista, texto), la cita, el destino, la propiedad, el valor métrico y la fecha de confirmación. Dos firmas de cambio permiten invalidar la asociación al cambiar fuente o destino. Son firmas de detección de cambios, no firmas criptográficas de autoría. La confirmación es una decisión de usuario, no certificación BIM ni un registro de responsabilidad profesional.

Frontend y backend validan tipos, propiedades admitidas, tamaño máximo de texto, valores finitos y hasta 2000 vínculos. Una referencia inexistente puede mantenerse como registro obsoleto; nunca se aplica. No se necesita una migración de tablas porque el contrato se persiste en la geometría JSONB existente.

Las referencias no-planas sobreviven a recompilar el CAD principal. Un nivel utilizado por una referencia conserva su ID. La vista de referencia tiene `metersPerUnit: 1` solo para su documento, con advertencia `reference-not-calibrated`; no se usa para convertir sus distancias en medidas del edificio. Las alturas se leen/introducen expresamente en metros.

No se ha implementado federación de varios DWG editables ni correspondencia geométrica completa con rotaciones, ejes, fachadas, cuadros de armadura o conexiones MEP. El alcance de esta fase es la correspondencia trazable de medidas verticales.

## Evaluación reproducible del detector

Desde el inspector 3D, «Evaluación del reconocimiento → Exportar detecciones» descarga las propuestas brutas por nivel. Cada muestra utiliza metros en el sistema `project-xy`: X hacia la derecha, Y hacia abajo, mismo origen que el Blueprint. Se separan los niveles para que objetos superpuestos de distintas plantas no se emparejen entre sí. La exportación no incluye imágenes, credenciales ni las anotaciones verdaderas.

La exportación métrica requiere unidades CAD confirmadas o calibración de la imagen. Una escala provisional no debe convertirse silenciosamente en una medida de evaluación.

Una exportación del espacio de trabajo puede incluir correcciones humanas anteriores. Su metadato `inputPolicy` lo declara; no debe presentarse como una inferencia automática sobre el original sin editar. Para la comparación reproducible se incluye un ejecutor de la línea base sobre el DWG original:

```powershell
npm run infer:cad -- --source "C:\planos\edificio.dwg" --meters-per-unit 1 --sample-prefix edificio-a --out predicciones-baseline.json
```

Indica explícitamente la unidad del dibujo: 1 para metros, 0.01 para centímetros o 0.001 para milímetros. Se aplica antes de interpretar capas anónimas y detectar vistas. El ejecutor usa el parser CAD ya incluido, no el estado editable del proyecto; registra SHA-256 del archivo, versión y configuración. No incorpora vínculos manuales ni correcciones del workspace. La altura de referencia de 2.8 m sigue siendo una suposición declarada; las métricas de cajas no evalúan alturas. No se debe ajustar la configuración con el conjunto de prueba.

Si la anotación incluye `sourceHash`, el evaluador exige que las predicciones de esa muestra provengan del mismo archivo. El prefijo y el ID de nivel de las muestras deben coincidir entre anotación y predicción. Las agrupaciones de particiones siguen siendo por edificio, porque distintas láminas del mismo edificio tienen hashes distintos.

Las predicciones contienen `schemaVersion: 1`, `detector: {id, version}` y `samples: [{id, units, coordinateFrame, objects}]`. Cada objeto tiene `id`, `class`, `bbox: [minX,minY,maxX,maxY]` y, para una abertura, `hostId` cuando está disponible. Las cajas son envolventes 2D, incluso para paredes inclinadas: sus métricas no miden fidelidad de malla, contornos, alturas, materiales, normativa ni calidad BIM.

El archivo de anotaciones **debe ser elaborado y revisado independientemente**, observando las fuentes. No debe obtenerse cambiando la etiqueta del archivo de predicciones. Formato de un ejemplo puramente sintético:

```json
{
  "schemaVersion": 1,
  "datasetId": "ejemplo-sintetico-no-benchmark",
  "version": "1",
  "samples": [
    {
      "id": "ID-DE-PROYECTO:ID-DE-NIVEL",
      "sourceGroup": "edificio-unico-a",
      "split": "test",
      "units": "m",
      "coordinateFrame": "project-xy",
      "exhaustiveClasses": ["wall", "door"],
      "annotator": "Identificador del revisor",
      "reviewed": true,
      "objects": [
        { "id": "gt-wall-1", "class": "wall", "bbox": [0, 0, 10, 0.2] },
        {
          "id": "gt-door-1",
          "class": "door",
          "bbox": [2, 0, 2.9, 0.2],
          "hostId": "gt-wall-1"
        }
      ]
    }
  ]
}
```

`exhaustiveClasses` identifica las clases completamente anotadas en esa muestra. Dentro de esas clases, una predicción de más cuenta como falso positivo y una omisión cuenta como falso negativo. Las otras clases se reportan como ignoradas: un resultado parcial no debe presentarse como reconocimiento completo. Un fallo total de inferencia puede representarse con `samples: []`; las muestras de prueba ausentes siguen contando como omisiones.

Ejecutar en el frontend:

```powershell
npm run evaluate:detector -- --truth anotaciones-revisadas.json --predictions detecciones.json --split test --iou 0.5 --out informe.json
```

El evaluador valida el corpus y rechaza IDs duplicados, cajas inválidas, muestras inventadas y un mismo `sourceGroup` presente en diferentes particiones. El grupo debe ser el edificio/proyecto original: láminas, pisos, recortes y revisiones del mismo edificio pertenecen siempre a la misma partición. No basta con agrupar por nombre de archivo.

El emparejamiento es uno a uno, por clase e IoU mínimo. Usa máxima cardinalidad con caminos aumentantes para evitar perder aciertos por un emparejamiento voraz y para que duplicar una predicción no aumente los aciertos. La IoU media corresponde al emparejamiento determinista encontrado; no se afirma que maximice la suma total de IoU. El informe incluye TP/FP/FN, precisión, recall, F1 por clase y global micro, IoU media de objetos emparejados, IDs de errores y exactitud de anfitrión cuando la anotación la permite. Los cocientes sin denominador son `null`, no una exactitud ficticia del 100 %.

Esto mide un punto operativo fijo. No calcula AP/mAP, calibración probabilística, reconocimiento de texto, latencia de inferencia ni rendimiento de órbita. Esas evaluaciones requieren protocolos adicionales.

## Trabajo requerido para un detector aprendido

La interfaz de predicciones admite un detector posterior siempre que exporte las mismas clases, coordenadas y versión. Para seleccionarlo con evidencia se necesita:

- Anotar los DWG y las imágenes reales con un arquitecto; acordar clases, criterios de inclusión, anfitriones, símbolos no representables y casos dudosos. Identificar derechos de uso de las fuentes y de cualquier corpus externo antes de entrenamiento comercial.
- Mantener divisiones por edificio y reservar un conjunto externo de oficinas, auditorios, vivienda y documentos de mala calidad. Anotar también vistas sin determinados elementos para medir falsos positivos.
- Comparar la línea base con el detector candidato sobre las mismas muestras y publicar errores por clase. Definir con los arquitectos umbrales de aceptación para cada uso, sin elegirlos después de mirar el conjunto de prueba.
- Medir segmentación/topología además de cajas para reconstrucción de muros; evaluar asociaciones entre vistas por ID de elemento y propiedad; evaluar las alturas contra cotas verificadas.
- La inferencia CPU ya está aislada en un worker del backend, con cola acotada y tiempo límite. Para producción sigue pendiente resolver derechos de los pesos/datos, medir memoria y concurrencia y seleccionar infraestructura adecuada; no se habilita automáticamente en Render.

Sin anotaciones revisadas y derechos adecuados no corresponde publicar precisión real, afirmar entrenamiento propio ni habilitar comercialmente el candidato experimental. El protocolo permite comparar propuestas; los conteos de objetos no son evidencia de calidad.

## Verificación

`npm run test:coordination` verifica cotas con unidades, rechazo de cifras ambiguas, invalidación por cambios, conflictos entre fuentes, anfitriones, preservación de la salida bruta, exclusión de cortes de la extrusión y retención de páginas de referencia. `npm run test:detector` verifica duplicados, errores por clase, emparejamiento no voraz, anfitriones, particiones, omisiones y entradas inválidas. Son pruebas sintéticas del contrato y algoritmo, diferenciadas expresamente de una evaluación del detector con edificios reales.
